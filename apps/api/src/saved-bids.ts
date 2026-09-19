import { BidIntent } from "@holdline/types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Accounts } from "./accounts.js";
import type { Store } from "./app.js";
import { requireAccount } from "./auth.js";

const Name = z.string().trim().min(1).max(80).nullable();
const CreateBody = z.object({
  intent: BidIntent,
  name: Name.optional(),
  isDefault: z.boolean().default(false),
});
const UpdateBody = z.object({
  intent: BidIntent.optional(),
  name: Name.optional(),
  isDefault: z.literal(true).optional(),
});
const Params = z.object({ id: z.string().min(1).max(64) });

/** A signed-in crew member's saved bids, one of which can be the default they start from. */
export async function registerSavedBids(
  app: FastifyInstance,
  opts: { accounts: Accounts; store: Store },
) {
  const { accounts, store } = opts;

  /** The deployment a saved intent belongs to, or null for an unknown airline/crew pair. */
  async function deploymentFor(intent: BidIntent) {
    const airline = await store.findAirline(intent.airline.toUpperCase());
    return airline?.deployments.find((d) => d.crewGroup === intent.crewGroup) ?? null;
  }

  app.get("/bids", async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return reply;
    return { bids: await accounts.listBids(account.id) };
  });

  app.get("/bids/default", async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return reply;
    const bid = await accounts.getDefaultBid(account.id);
    return bid ? { bid } : reply.code(404).send({ error: "no_default_bid" });
  });

  app.get("/bids/:id", async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return reply;
    const { id } = Params.parse(req.params);
    const bid = await accounts.getBid(account.id, id);
    return bid ? { bid } : reply.code(404).send({ error: "not_found" });
  });

  app.post("/bids", async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return reply;
    const body = CreateBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_bid", issues: body.error.issues });
    }
    const intent = {
      ...body.data.intent,
      airline: body.data.intent.airline.toUpperCase(),
      base: body.data.intent.base.toUpperCase(),
    };
    const deployment = await deploymentFor(intent);
    if (!deployment) return reply.code(404).send({ error: "no_pbs_deployment" });
    const bid = await accounts.createBid(account.id, deployment.id, {
      name: body.data.name ?? null,
      month: intent.month,
      intent,
      isDefault: body.data.isDefault,
    });
    return reply.code(201).send({ bid });
  });

  app.patch("/bids/:id", async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return reply;
    const { id } = Params.parse(req.params);
    const body = UpdateBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_bid", issues: body.error.issues });
    }
    let deploymentId: string | undefined;
    if (body.data.intent) {
      const deployment = await deploymentFor(body.data.intent);
      if (!deployment) return reply.code(404).send({ error: "no_pbs_deployment" });
      deploymentId = deployment.id;
    }
    const bid = await accounts.updateBid(account.id, id, { ...body.data, deploymentId });
    return bid ? { bid } : reply.code(404).send({ error: "not_found" });
  });

  app.delete("/bids/:id", async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return reply;
    const { id } = Params.parse(req.params);
    return (await accounts.deleteBid(account.id, id))
      ? reply.code(204).send()
      : reply.code(404).send({ error: "not_found" });
  });
}
