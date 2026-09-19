import type { Db, Prisma } from "@holdline/db";
import type { BidIntent } from "@holdline/types";

type CrewGroup = BidIntent["crewGroup"];

/** What the API returns about the signed-in crew member. No credentials, ever. */
export interface Account {
  id: string;
  email: string;
  airline: string | null;
  crewGroup: CrewGroup | null;
  base: string | null;
  seniority: number | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  /** Internal: used to open the billing portal. Not sent to the browser. */
  stripeCustomerId: string | null;
}

export interface Profile {
  airline?: string | null;
  crewGroup?: CrewGroup | null;
  base?: string | null;
  seniority?: number | null;
}

export interface SavedBidSummary {
  id: string;
  name: string | null;
  month: string;
  airline: string;
  crewGroup: CrewGroup;
  base: string;
  isDefault: boolean;
  updatedAt: string;
}

export interface SavedBid extends SavedBidSummary {
  intent: unknown;
}

/** Users, sessions, sign-in links, saved bids and billing state. Tests pass an in-memory version. */
export interface Accounts {
  createLoginToken(email: string, tokenHash: string, expiresAt: Date): Promise<void>;
  countLoginTokensSince(email: string, since: Date): Promise<number>;
  /** Marks the link used and returns its email, or null when unknown, used or expired. */
  consumeLoginToken(tokenHash: string, now: Date): Promise<string | null>;
  upsertUser(email: string): Promise<Account>;
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findSession(tokenHash: string, now: Date): Promise<Account | null>;
  deleteSession(tokenHash: string): Promise<void>;
  /** Unknown airline codes return null. */
  updateProfile(userId: string, profile: Profile): Promise<Account | null>;

  listBids(userId: string): Promise<SavedBidSummary[]>;
  getBid(userId: string, id: string): Promise<SavedBid | null>;
  getDefaultBid(userId: string): Promise<SavedBid | null>;
  createBid(
    userId: string,
    deploymentId: string,
    bid: { name: string | null; month: string; intent: BidIntent; isDefault: boolean },
  ): Promise<SavedBid>;
  updateBid(
    userId: string,
    id: string,
    change: {
      name?: string | null;
      intent?: BidIntent;
      deploymentId?: string;
      isDefault?: boolean;
    },
  ): Promise<SavedBid | null>;
  deleteBid(userId: string, id: string): Promise<boolean>;

  linkStripeCustomer(userId: string, customerId: string): Promise<void>;
  updateSubscription(
    customerId: string,
    status: string,
    currentPeriodEnd: Date | null,
  ): Promise<void>;
}

/** Accounts backed by Postgres through Prisma. */
export function prismaAccounts(db: Db): Accounts {
  const include = { airline: { select: { code: true } } } as const;
  type UserRow = Prisma.UserGetPayload<{ include: typeof include }>;
  const account = (u: UserRow): Account => ({
    id: u.id,
    email: u.email,
    airline: u.airline?.code ?? null,
    crewGroup: u.crewGroup,
    base: u.base,
    seniority: u.seniority,
    subscriptionStatus: u.subscriptionStatus,
    currentPeriodEnd: u.currentPeriodEnd?.toISOString() ?? null,
    stripeCustomerId: u.stripeCustomerId,
  });

  const bidInclude = { deployment: { include: { airline: { select: { code: true } } } } } as const;
  type BidRow = Prisma.BidGetPayload<{ include: typeof bidInclude }>;
  const summary = (b: BidRow): SavedBidSummary => {
    const intent = b.intent as { base?: string };
    return {
      id: b.id,
      name: b.name,
      month: b.month,
      airline: b.deployment.airline.code,
      crewGroup: b.deployment.crewGroup,
      base: intent.base ?? "",
      isDefault: b.isDefault,
      updatedAt: b.updatedAt.toISOString(),
    };
  };
  const full = (b: BidRow): SavedBid => ({ ...summary(b), intent: b.intent });

  return {
    async createLoginToken(email, tokenHash, expiresAt) {
      await db.loginToken.create({ data: { email, tokenHash, expiresAt } });
    },
    countLoginTokensSince: (email, since) =>
      db.loginToken.count({ where: { email, createdAt: { gte: since } } }),
    async consumeLoginToken(tokenHash, now) {
      // One UPDATE so two clicks on the same link can't both sign in.
      const { count } = await db.loginToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (count === 0) return null;
      const token = await db.loginToken.findUnique({ where: { tokenHash } });
      return token?.email ?? null;
    },
    async upsertUser(email) {
      return account(
        await db.user.upsert({ where: { email }, update: {}, create: { email }, include }),
      );
    },
    async createSession(userId, tokenHash, expiresAt) {
      await db.session.create({ data: { userId, tokenHash, expiresAt } });
    },
    async findSession(tokenHash, now) {
      const session = await db.session.findUnique({
        where: { tokenHash },
        include: { user: { include } },
      });
      return session && session.expiresAt > now ? account(session.user) : null;
    },
    async deleteSession(tokenHash) {
      await db.session.deleteMany({ where: { tokenHash } });
    },
    async updateProfile(userId, profile) {
      let airlineId: string | null | undefined;
      if (profile.airline !== undefined) {
        if (profile.airline === null) airlineId = null;
        else {
          const found = await db.airline.findUnique({ where: { code: profile.airline } });
          if (!found) return null;
          airlineId = found.id;
        }
      }
      return account(
        await db.user.update({
          where: { id: userId },
          data: {
            airlineId,
            crewGroup: profile.crewGroup,
            base: profile.base,
            seniority: profile.seniority,
          },
          include,
        }),
      );
    },

    async listBids(userId) {
      const rows = await db.bid.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        include: bidInclude,
      });
      return rows.map(summary);
    },
    async getBid(userId, id) {
      const row = await db.bid.findFirst({ where: { id, userId }, include: bidInclude });
      return row ? full(row) : null;
    },
    async getDefaultBid(userId) {
      const row = await db.bid.findFirst({
        where: { userId, isDefault: true },
        include: bidInclude,
      });
      return row ? full(row) : null;
    },
    async createBid(userId, deploymentId, bid) {
      const row = await db.$transaction(async (tx) => {
        if (bid.isDefault)
          await tx.bid.updateMany({ where: { userId }, data: { isDefault: false } });
        return tx.bid.create({
          data: {
            userId,
            deploymentId,
            month: bid.month,
            name: bid.name,
            isDefault: bid.isDefault,
            intent: bid.intent,
          },
          include: bidInclude,
        });
      });
      return full(row);
    },
    async updateBid(userId, id, change) {
      const row = await db.$transaction(async (tx) => {
        const existing = await tx.bid.findFirst({ where: { id, userId } });
        if (!existing) return null;
        if (change.isDefault)
          await tx.bid.updateMany({ where: { userId }, data: { isDefault: false } });
        return tx.bid.update({
          where: { id },
          data: {
            name: change.name,
            isDefault: change.isDefault,
            deploymentId: change.deploymentId,
            month: change.intent?.month,
            intent: change.intent,
          },
          include: bidInclude,
        });
      });
      return row ? full(row) : null;
    },
    async deleteBid(userId, id) {
      const { count } = await db.bid.deleteMany({ where: { id, userId } });
      return count > 0;
    },

    async linkStripeCustomer(userId, customerId) {
      await db.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
    },
    async updateSubscription(customerId, status, currentPeriodEnd) {
      await db.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: { subscriptionStatus: status, currentPeriodEnd },
      });
    },
  };
}
