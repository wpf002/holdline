import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Account, Accounts } from "./accounts.js";
import type { Mailer } from "./mailer.js";

export const SESSION_COOKIE = "holdline_session";
const LINK_MINUTES = 15;
const SESSION_DAYS = 30;
const LINKS_PER_HOUR = 5;

export interface AuthOptions {
  accounts: Accounts;
  /** Absent in production without an email provider; /auth/magic-link then answers 503. */
  mailer?: Mailer;
  /** Base URL of the web app, for the link in the email. */
  webUrl: string;
  cookie: { secure: boolean; sameSite: "lax" | "strict" | "none" };
  now?: () => Date;
}

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The account to show the browser: everything except internal billing ids. */
export function publicAccount(a: Account) {
  const { stripeCustomerId: _internal, ...rest } = a;
  void _internal;
  return rest;
}

declare module "fastify" {
  interface FastifyRequest {
    account: Account | null;
  }
}

const Email = z.object({
  email: z
    .email()
    .max(254)
    .transform((e) => e.trim().toLowerCase()),
});
const Verify = z.object({ token: z.string().min(20).max(200) });
const ProfileBody = z.object({
  airline: z
    .string()
    .min(2)
    .max(4)
    .transform((s) => s.toUpperCase())
    .nullable()
    .optional(),
  crewGroup: z.enum(["PILOT", "FLIGHT_ATTENDANT"]).nullable().optional(),
  base: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .transform((s) => s.toUpperCase())
    .nullable()
    .optional(),
  seniority: z.number().int().min(1).nullable().optional(),
});

/** Answers 401 and returns null when the request isn't signed in. */
export function requireAccount(req: FastifyRequest, reply: FastifyReply): Account | null {
  if (req.account) return req.account;
  reply.code(401).send({ error: "sign_in_required" });
  return null;
}

/** Magic-link sign-in with a session cookie. Only SHA-256 hashes of tokens are stored. */
export async function registerAuth(app: FastifyInstance, opts: AuthOptions) {
  const { accounts, webUrl } = opts;
  const now = opts.now ?? (() => new Date());
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    secure: opts.cookie.secure,
    sameSite: opts.cookie.sameSite,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };

  app.decorateRequest("account", null);
  app.addHook("preHandler", async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    req.account = token ? await accounts.findSession(hashToken(token), now()) : null;
  });

  // Always 202 for a valid email, so the endpoint doesn't reveal who has an account.
  app.post("/auth/magic-link", async (req, reply) => {
    const body = Email.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_email" });
    if (!opts.mailer) {
      return reply.code(503).send({
        error: "email_not_configured",
        todo: "Set RESEND_API_KEY and MAIL_FROM for the API to send sign-in links.",
      });
    }
    const { email } = body.data;
    const hourAgo = new Date(now().getTime() - 60 * 60 * 1000);
    if ((await accounts.countLoginTokensSince(email, hourAgo)) >= LINKS_PER_HOUR) {
      return reply.code(429).send({ error: "too_many_links" });
    }
    const token = newToken();
    await accounts.createLoginToken(
      email,
      hashToken(token),
      new Date(now().getTime() + LINK_MINUTES * 60 * 1000),
    );
    const url = `${webUrl}/login/verify?token=${encodeURIComponent(token)}`;
    try {
      await opts.mailer.sendLoginLink(email, url);
    } catch (err) {
      req.log.error({ err }, "sign-in email failed");
      return reply.code(502).send({ error: "email_failed" });
    }
    return reply.code(202).send({ ok: true });
  });

  app.post("/auth/verify", async (req, reply) => {
    const body = Verify.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_link" });
    const email = await accounts.consumeLoginToken(hashToken(body.data.token), now());
    if (!email) return reply.code(400).send({ error: "invalid_link" });
    const account = await accounts.upsertUser(email);
    const session = newToken();
    await accounts.createSession(
      account.id,
      hashToken(session),
      new Date(now().getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    );
    reply.setCookie(SESSION_COOKIE, session, cookieOptions);
    return { account: publicAccount(account) };
  });

  app.get("/auth/me", async (req) => ({
    account: req.account ? publicAccount(req.account) : null,
  }));

  app.post("/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await accounts.deleteSession(hashToken(token));
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  // Defaults the bid form starts from: airline, seat, base, seniority.
  app.patch("/me", async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return reply;
    const body = ProfileBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_profile", issues: body.error.issues });
    }
    const updated = await accounts.updateProfile(account.id, body.data);
    if (!updated) return reply.code(404).send({ error: "unknown_airline" });
    return { account: publicAccount(updated) };
  });
}
