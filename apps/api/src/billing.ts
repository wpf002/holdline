import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import type { Accounts } from "./accounts.js";
import { requireAccount } from "./auth.js";

/** What Holdline needs from a payment provider. server.ts backs it with Stripe; tests pass a fake. */
export interface Billing {
  checkoutUrl(input: {
    userId: string;
    email: string;
    customerId: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string>;
  portalUrl(customerId: string, returnUrl: string): Promise<string>;
  /** Verifies the signature and returns what changed, or null for events Holdline ignores. */
  parseWebhook(rawBody: Buffer, signature: string): BillingEvent | null;
}

export type BillingEvent =
  | { type: "customer_linked"; userId: string; customerId: string }
  | { type: "subscription"; customerId: string; status: string; currentPeriodEnd: Date | null };

export class WebhookSignatureError extends Error {}

/** Stripe Checkout (subscription mode), the billing portal, and signed webhooks. */
export function stripeBilling(stripe: Stripe, priceId: string, webhookSecret: string): Billing {
  const id = (value: string | { id: string } | null) =>
    typeof value === "string" ? value : (value?.id ?? null);
  return {
    async checkoutUrl({ userId, email, customerId, successUrl, cancelUrl }) {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: userId,
        ...(customerId ? { customer: customerId } : { customer_email: email }),
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      if (!session.url) throw new Error("Stripe returned a Checkout session without a URL");
      return session.url;
    },
    async portalUrl(customerId, returnUrl) {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return session.url;
    },
    parseWebhook(rawBody, signature) {
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch (err) {
        throw new WebhookSignatureError((err as Error).message);
      }
      switch (event.type) {
        case "checkout.session.completed": {
          const s = event.data.object;
          const customerId = id(s.customer);
          return s.client_reference_id && customerId
            ? { type: "customer_linked", userId: s.client_reference_id, customerId }
            : null;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object;
          // Stripe reports the billing period per subscription item.
          const end = sub.items.data[0]?.current_period_end;
          return {
            type: "subscription",
            customerId: id(sub.customer)!,
            status: sub.status,
            currentPeriodEnd: end ? new Date(end * 1000) : null,
          };
        }
        default:
          return null;
      }
    },
  };
}

export async function registerBilling(
  app: FastifyInstance,
  opts: { accounts: Accounts; billing?: Billing; webUrl: string },
) {
  const { accounts, billing, webUrl } = opts;
  const notConfigured = {
    error: "billing_not_configured",
    todo: "Set STRIPE_SECRET_KEY, STRIPE_PRICE_ID and STRIPE_WEBHOOK_SECRET for the API.",
  };

  app.post("/billing/checkout", async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return reply;
    if (!billing) return reply.code(503).send(notConfigured);
    const url = await billing.checkoutUrl({
      userId: account.id,
      email: account.email,
      customerId: account.stripeCustomerId,
      successUrl: `${webUrl}/account?billing=done`,
      cancelUrl: `${webUrl}/account`,
    });
    return { url };
  });

  app.post("/billing/portal", async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return reply;
    if (!billing) return reply.code(503).send(notConfigured);
    if (!account.stripeCustomerId) return reply.code(409).send({ error: "no_subscription" });
    return { url: await billing.portalUrl(account.stripeCustomerId, `${webUrl}/account`) };
  });

  // Stripe signs the raw body, so this route gets its own JSON parser that keeps the bytes.
  await app.register(async (scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) =>
      done(null, body),
    );
    scope.post("/billing/webhook", async (req, reply) => {
      if (!billing) return reply.code(503).send(notConfigured);
      const signature = req.headers["stripe-signature"];
      if (typeof signature !== "string")
        return reply.code(400).send({ error: "missing_signature" });
      let event: BillingEvent | null;
      try {
        event = billing.parseWebhook(req.body as Buffer, signature);
      } catch (err) {
        if (err instanceof WebhookSignatureError) {
          return reply.code(400).send({ error: "bad_signature" });
        }
        throw err;
      }
      if (event?.type === "customer_linked") {
        await accounts.linkStripeCustomer(event.userId, event.customerId);
      } else if (event?.type === "subscription") {
        await accounts.updateSubscription(event.customerId, event.status, event.currentPeriodEnd);
      }
      return { received: true };
    });
  });
}
