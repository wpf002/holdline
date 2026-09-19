import Anthropic from "@anthropic-ai/sdk";
import { createDb } from "@holdline/db";
import Stripe from "stripe";
import { prismaAccounts } from "./accounts.js";
import { buildApp } from "./app.js";
import { stripeBilling } from "./billing.js";
import { env } from "./env.js";
import { logMailer, resendMailer } from "./mailer.js";
import { createParser } from "./parse.js";
import { prismaStore } from "./store.js";

const db = createDb(env.DATABASE_URL);
const anthropic = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 1 })
  : null;

// Emails go through Resend when configured; in development the link is logged instead.
const mailer = env.RESEND_API_KEY
  ? resendMailer(env.RESEND_API_KEY, env.MAIL_FROM)
  : env.PRODUCTION
    ? undefined
    : logMailer((line) => console.warn(line));
const billing =
  env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID && env.STRIPE_WEBHOOK_SECRET
    ? stripeBilling(
        new Stripe(env.STRIPE_SECRET_KEY),
        env.STRIPE_PRICE_ID,
        env.STRIPE_WEBHOOK_SECRET,
      )
    : undefined;

const app = await buildApp(
  {
    store: prismaStore(db),
    parser: anthropic
      ? createParser((params) => anthropic.messages.create(params), env.ANTHROPIC_MODEL)
      : undefined,
    accounts: {
      accounts: prismaAccounts(db),
      mailer,
      billing,
      webUrl: env.WEB_URL,
      cookie: { secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAMESITE },
    },
  },
  { corsOrigins: env.CORS_ORIGINS, logger: true },
);

app.addHook("onClose", async () => db.$disconnect());
await app.listen({ port: env.PORT, host: "0.0.0.0" });
