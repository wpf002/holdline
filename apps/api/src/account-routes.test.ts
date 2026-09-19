import type { BidIntent } from "@holdline/types";
import { beforeEach, describe, expect, it } from "vitest";
import type { Account, Accounts, SavedBid } from "./accounts.js";
import { buildApp, type AirlineRecord, type Store } from "./app.js";
import { SESSION_COOKIE } from "./auth.js";
import { WebhookSignatureError, type Billing, type BillingEvent } from "./billing.js";

/** In-memory Accounts with the same rules as the Prisma version. */
function memoryAccounts(deployments: Map<string, { airline: string; crewGroup: string }>) {
  const users = new Map<string, Account>();
  const tokens = new Map<
    string,
    { email: string; expiresAt: Date; usedAt: Date | null; createdAt: Date }
  >();
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();
  const bids = new Map<string, SavedBid & { userId: string }>();
  let seq = 0;
  const strip = ({ userId: _u, ...b }: SavedBid & { userId: string }): SavedBid => (void _u, b);

  const accounts: Accounts = {
    async createLoginToken(email, tokenHash, expiresAt) {
      tokens.set(tokenHash, { email, expiresAt, usedAt: null, createdAt: new Date() });
    },
    async countLoginTokensSince(email, since) {
      return [...tokens.values()].filter((t) => t.email === email && t.createdAt >= since).length;
    },
    async consumeLoginToken(tokenHash, now) {
      const t = tokens.get(tokenHash);
      if (!t || t.usedAt || t.expiresAt <= now) return null;
      t.usedAt = now;
      return t.email;
    },
    async upsertUser(email) {
      const existing = [...users.values()].find((u) => u.email === email);
      if (existing) return existing;
      const user: Account = {
        id: `u${++seq}`,
        email,
        airline: null,
        crewGroup: null,
        base: null,
        seniority: null,
        subscriptionStatus: null,
        currentPeriodEnd: null,
        stripeCustomerId: null,
      };
      users.set(user.id, user);
      return user;
    },
    async createSession(userId, tokenHash, expiresAt) {
      sessions.set(tokenHash, { userId, expiresAt });
    },
    async findSession(tokenHash, now) {
      const s = sessions.get(tokenHash);
      return s && s.expiresAt > now ? users.get(s.userId)! : null;
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
    async updateProfile(userId, profile) {
      if (profile.airline && profile.airline !== "ENY") return null;
      const user = users.get(userId)!;
      const next = {
        ...user,
        ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined)),
      };
      users.set(userId, next as Account);
      return next as Account;
    },
    async listBids(userId) {
      return [...bids.values()]
        .filter((b) => b.userId === userId)
        .map(({ intent: _i, ...b }) => (void _i, strip({ ...b, intent: null })));
    },
    async getBid(userId, id) {
      const b = bids.get(id);
      return b && b.userId === userId ? strip(b) : null;
    },
    async getDefaultBid(userId) {
      const b = [...bids.values()].find((x) => x.userId === userId && x.isDefault);
      return b ? strip(b) : null;
    },
    async createBid(userId, deploymentId, bid) {
      if (bid.isDefault)
        for (const b of bids.values()) if (b.userId === userId) b.isDefault = false;
      const d = deployments.get(deploymentId)!;
      const row = {
        id: `b${++seq}`,
        userId,
        name: bid.name,
        month: bid.month,
        airline: d.airline,
        crewGroup: d.crewGroup as BidIntent["crewGroup"],
        base: bid.intent.base,
        isDefault: bid.isDefault,
        updatedAt: new Date().toISOString(),
        intent: bid.intent,
      };
      bids.set(row.id, row);
      return strip(row);
    },
    async updateBid(userId, id, change) {
      const b = bids.get(id);
      if (!b || b.userId !== userId) return null;
      if (change.isDefault)
        for (const x of bids.values()) if (x.userId === userId) x.isDefault = false;
      if (change.name !== undefined) b.name = change.name;
      if (change.isDefault) b.isDefault = true;
      if (change.intent) Object.assign(b, { intent: change.intent, month: change.intent.month });
      return strip(b);
    },
    async deleteBid(userId, id) {
      const b = bids.get(id);
      if (!b || b.userId !== userId) return false;
      return bids.delete(id);
    },
    async linkStripeCustomer(userId, customerId) {
      users.get(userId)!.stripeCustomerId = customerId;
    },
    async updateSubscription(customerId, status, currentPeriodEnd) {
      for (const u of users.values()) {
        if (u.stripeCustomerId === customerId) {
          u.subscriptionStatus = status;
          u.currentPeriodEnd = currentPeriodEnd?.toISOString() ?? null;
        }
      }
    },
  };
  return { accounts, users };
}

const airlines: AirlineRecord[] = [
  {
    code: "ENY",
    name: "Envoy Air",
    deployments: [
      {
        id: "eny-pilot",
        crewGroup: "PILOT",
        vendor: "NAVBLUE",
        dialect: "ORDERED_GROUPS",
        confidence: "THIRD_PARTY",
        config: {},
      },
    ],
  },
];
const store: Store = {
  listAirlines: async () => airlines,
  findAirline: async (code) => airlines.find((a) => a.code === code) ?? null,
  loadPairings: async () => null,
  savePairings: async () => {},
  saveAwards: async () => {},
  loadHistory: async () => [],
};

const intent = {
  airline: "ENY",
  crewGroup: "PILOT",
  month: "2026-10",
  base: "DFW",
  daysOff: { dates: ["2026-10-10"] },
  priorities: ["daysOff"],
};

let sent: { to: string; url: string }[];
let events: BillingEvent[];
const billing: Billing = {
  checkoutUrl: async ({ userId }) => `https://checkout.example/${userId}`,
  portalUrl: async (customerId) => `https://portal.example/${customerId}`,
  parseWebhook: (raw, signature) => {
    if (signature !== "good") throw new WebhookSignatureError("bad");
    void raw;
    return events.shift() ?? null;
  },
};

async function setup(options: { mailer?: boolean; billing?: boolean } = {}) {
  sent = [];
  events = [];
  const memory = memoryAccounts(new Map([["eny-pilot", { airline: "ENY", crewGroup: "PILOT" }]]));
  const app = await buildApp({
    store,
    accounts: {
      accounts: memory.accounts,
      mailer:
        options.mailer === false
          ? undefined
          : { sendLoginLink: async (to, url) => void sent.push({ to, url }) },
      billing: options.billing === false ? undefined : billing,
      webUrl: "http://web.test",
      cookie: { secure: false, sameSite: "lax" },
    },
  });
  /** Signs in and returns the session cookie header. */
  async function signIn(email = "Pilot@Example.com") {
    await app.inject({ method: "POST", url: "/auth/magic-link", payload: { email } });
    const token = new URL(sent.at(-1)!.url).searchParams.get("token")!;
    const res = await app.inject({ method: "POST", url: "/auth/verify", payload: { token } });
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE)!;
    return { res, token, cookie: `${SESSION_COOKIE}=${cookie.value}`, raw: cookie };
  }
  return { app, memory, signIn };
}

describe("magic-link sign-in", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it("emails a one-time link, signs in with an HttpOnly cookie, and signs out", async () => {
    const { app, signIn } = ctx;
    const { res, token, cookie, raw } = await signIn();
    expect(sent[0]).toMatchObject({ to: "pilot@example.com" });
    expect(sent[0]!.url).toMatch(/^http:\/\/web\.test\/login\/verify\?token=/);
    expect(res.statusCode).toBe(200);
    expect(res.json().account).toMatchObject({ email: "pilot@example.com" });
    expect(res.json().account).not.toHaveProperty("stripeCustomerId");
    expect(raw).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });

    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.json().account.email).toBe("pilot@example.com");

    const again = await app.inject({ method: "POST", url: "/auth/verify", payload: { token } });
    expect(again.statusCode).toBe(400);

    const out = await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie } });
    expect(out.statusCode).toBe(204);
    const after = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(after.json()).toEqual({ account: null });
  });

  it("limits links per email and rejects bad input", async () => {
    const { app } = ctx;
    const ask = () =>
      app.inject({ method: "POST", url: "/auth/magic-link", payload: { email: "a@b.co" } });
    for (let i = 0; i < 5; i++) expect((await ask()).statusCode).toBe(202);
    expect((await ask()).statusCode).toBe(429);
    const bad = await app.inject({
      method: "POST",
      url: "/auth/magic-link",
      payload: { email: "nope" },
    });
    expect(bad.statusCode).toBe(400);
  });

  it("503 without an email provider", async () => {
    const { app } = await setup({ mailer: false });
    const res = await app.inject({
      method: "POST",
      url: "/auth/magic-link",
      payload: { email: "a@b.co" },
    });
    expect(res.statusCode).toBe(503);
  });

  it("updates profile defaults for signed-in users only", async () => {
    const { app, signIn } = ctx;
    const anon = await app.inject({ method: "PATCH", url: "/me", payload: { base: "DFW" } });
    expect(anon.statusCode).toBe(401);
    const { cookie } = await signIn();
    const ok = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: { cookie },
      payload: { airline: "eny", crewGroup: "PILOT", base: "dfw", seniority: 412 },
    });
    expect(ok.json().account).toMatchObject({ airline: "ENY", base: "DFW", seniority: 412 });
    const unknown = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: { cookie },
      payload: { airline: "ZZZ" },
    });
    expect(unknown.statusCode).toBe(404);
  });
});

describe("saved bids", () => {
  it("saves, lists, defaults, and deletes a crew member's own bids", async () => {
    const { app, signIn } = await setup();
    const { cookie } = await signIn();
    const other = (await signIn("other@example.com")).cookie;

    const first = await app.inject({
      method: "POST",
      url: "/bids",
      headers: { cookie },
      payload: { intent, name: "October", isDefault: true },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: "POST",
      url: "/bids",
      headers: { cookie },
      payload: { intent: { ...intent, month: "2026-11" }, name: "November" },
    });
    const secondId = second.json().bid.id;

    const list = await app.inject({ method: "GET", url: "/bids", headers: { cookie } });
    expect(list.json().bids.map((b: { name: string }) => b.name)).toEqual(["October", "November"]);

    await app.inject({
      method: "PATCH",
      url: `/bids/${secondId}`,
      headers: { cookie },
      payload: { isDefault: true },
    });
    const def = await app.inject({ method: "GET", url: "/bids/default", headers: { cookie } });
    expect(def.json().bid).toMatchObject({ name: "November", isDefault: true, airline: "ENY" });

    const stolen = await app.inject({
      method: "GET",
      url: `/bids/${secondId}`,
      headers: { cookie: other },
    });
    expect(stolen.statusCode).toBe(404);
    const gone = await app.inject({
      method: "DELETE",
      url: `/bids/${secondId}`,
      headers: { cookie },
    });
    expect(gone.statusCode).toBe(204);
    const anon = await app.inject({ method: "GET", url: "/bids" });
    expect(anon.statusCode).toBe(401);
  });
});

describe("billing", () => {
  it("opens Checkout, links the customer from the webhook, then the portal", async () => {
    const { app, signIn, memory } = await setup();
    const { cookie } = await signIn();
    const userId = [...memory.users.values()][0]!.id;

    const checkout = await app.inject({
      method: "POST",
      url: "/billing/checkout",
      headers: { cookie },
    });
    expect(checkout.json()).toEqual({ url: `https://checkout.example/${userId}` });
    expect(
      (await app.inject({ method: "POST", url: "/billing/portal", headers: { cookie } }))
        .statusCode,
    ).toBe(409);

    events.push(
      { type: "customer_linked", userId, customerId: "cus_1" },
      {
        type: "subscription",
        customerId: "cus_1",
        status: "active",
        currentPeriodEnd: new Date("2026-10-19T00:00:00Z"),
      },
    );
    const hook = (signature: string) =>
      app.inject({
        method: "POST",
        url: "/billing/webhook",
        headers: { "content-type": "application/json", "stripe-signature": signature },
        payload: "{}",
      });
    expect((await hook("good")).json()).toEqual({ received: true });
    await hook("good");
    expect((await hook("forged")).statusCode).toBe(400);

    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.json().account).toMatchObject({
      subscriptionStatus: "active",
      currentPeriodEnd: "2026-10-19T00:00:00.000Z",
    });
    const portal = await app.inject({
      method: "POST",
      url: "/billing/portal",
      headers: { cookie },
    });
    expect(portal.json()).toEqual({ url: "https://portal.example/cus_1" });
  });

  it("503 until Stripe is configured", async () => {
    const { app, signIn } = await setup({ billing: false });
    const { cookie } = await signIn();
    const res = await app.inject({ method: "POST", url: "/billing/checkout", headers: { cookie } });
    expect(res.statusCode).toBe(503);
  });
});
