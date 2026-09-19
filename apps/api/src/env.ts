import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see .env.example)`);
  return v;
}

const production = process.env.NODE_ENV === "production";
const sameSite = process.env.COOKIE_SAMESITE ?? "lax";

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  PORT: Number(process.env.PORT ?? process.env.API_PORT ?? 4000),
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
  PRODUCTION: production,
  /** Web app base URL, for links in emails and Stripe redirects. */
  WEB_URL: (process.env.WEB_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  MAIL_FROM: process.env.MAIL_FROM ?? "Holdline <signin@example.com>",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID ?? "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  /** Web and API on different sites (e.g. two *.up.railway.app hosts) need "none" plus secure. */
  COOKIE_SAMESITE: (["lax", "strict", "none"].includes(sameSite) ? sameSite : "lax") as
    "lax" | "strict" | "none",
  COOKIE_SECURE: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : production,
};
