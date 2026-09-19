# Holdline

Holdline turns a crew member's plain-English schedule wishes into a correct, ordered PBS bid for their airline's bidding system. It's the QuickBid experience (say what you want, get it sorted) rebuilt for Preferential Bidding Systems, where there are no lines to rank and the bid has to be written in the vendor's rule language.

**Status:** build steps 1–8. The web form builds a `BidIntent`; `POST /bids/compile` writes it for NAVBLUE (one group, relaxed by Denial Mode), Jeppesen (one bid group per relaxation step) or layered PBS (American and SkyWest AOS, one layer per step), and turns priorities into points for IBS / AD OPT (weighted PBS). Every compiler reports `syntaxVerified: false` until its wording is checked against a real bid screen; Jeppesen only emits statements with a documented example and warns on the rest. `POST /bids/parse` pre-fills the form from plain English once `ANTHROPIC_API_KEY` is set (503 without it). `POST /bid-periods/import` loads a month of pairings in Holdline's CSV or JSON format ([docs/pairing-import.md](docs/pairing-import.md)) so each line shows how many pairings it removes. `POST /awards/import` loads past award results ([docs/award-import.md](docs/award-import.md)); with your seniority, the bid shows how far down lines and matching pairings went. Signing in (magic link) lets crew save bids and keep a default bid; a Stripe subscription is wired up but no feature is behind it yet.

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict), Node 22 |
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js 16 (App Router) |
| API | Fastify 5 |
| DB | Postgres + Prisma 7 (`prisma.config.ts`, `@prisma/adapter-pg`) |
| Validation | zod 4 |
| AI | Anthropic API (plain English -> `BidIntent`) |
| Hosting | Railway |

## Local setup

```bash
git clone git@github.com:wpf002/holdline.git && cd holdline
pnpm install
cp .env.example .env            # set DATABASE_URL
createdb holdline               # or point DATABASE_URL at any Postgres 16
pnpm db:migrate --name init
pnpm db:seed
pnpm dev                        # web http://localhost:3000, api http://localhost:4000
curl localhost:4000/airlines    # real rows from Postgres
```

## Environment variables

| Name | Required | Where it comes from |
|---|---|---|
| `DATABASE_URL` | yes | Local Postgres, or `${{Postgres.DATABASE_URL}}` on Railway |
| `API_PORT` | no (4000) | Local only; Railway sets `PORT` |
| `CORS_ORIGINS` | no | Comma-separated web origins. Railway: the web service's public URL |
| `NEXT_PUBLIC_API_URL` | yes for web | API public URL |
| `ANTHROPIC_API_KEY` | for `/bids/parse` | console.anthropic.com -> API Keys. Without it the parser returns 503 and the form still works |
| `ANTHROPIC_MODEL` | no | Model ID used for parsing |
| `WEB_URL` | yes for sign-in | Web app base URL for sign-in links and Stripe redirects |
| `RESEND_API_KEY`, `MAIL_FROM` | for sign-in emails | resend.com. Without a key, development prints sign-in links to the API console; production answers 503 |
| `COOKIE_SAMESITE`, `COOKIE_SECURE` | no | Session cookie. Web and API on different sites need `none` and `true` |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | for billing | Stripe dashboard. Without all three, billing answers 503. Webhook endpoint: `POST /billing/webhook` |

## Project structure

```
apps/web          Next.js UI: preference wizard, bid preview, entry checklist
apps/api          Fastify: /airlines, /bids/compile, /bids/parse, /bid-periods/import
packages/types    zod schemas: BidIntent (canonical preferences), CompiledBid (vendor output)
packages/core     Compilers BidIntent -> CompiledBid, one per vendor dialect. Pure, no I/O
packages/db       Prisma schema, migrations, seed (airline -> PBS vendor map), client factory
packages/config   Shared tsconfig presets
docs/             PBS research: vendors, bid languages, UI references
```

## Deploy (Railway)

One project, three services: `Postgres`, `holdline-api` (root `/`, config `apps/api/railway.json`), `holdline-web` (root `/`, config `apps/web/railway.json`).

- On both app services set `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
- API build runs `prisma migrate deploy`; health check is `/health`.
- Set `NEXT_PUBLIC_API_URL` on web to the API's public domain, and `CORS_ORIGINS` on the API to the web's.

```bash
railway up --service holdline-api
railway up --service holdline-web
```

## Conventions

- `BidIntent` is the only input a compiler sees. Vendor-specific wording never leaks into it.
- Compilers are pure functions with golden tests. A change to output text needs a matching test change.
- `CompiledBid.syntaxVerified` stays `false` for a vendor until its labels are checked against a real bid screen or official guide. The UI shows a warning when false.
- Holdline never logs in to an airline system and never submits bids. Output is an entry checklist the crew member types in.
- Pilot data (pairing files, award reports, screenshots) goes in `data/private/` (gitignored). Never commit it; strip employee numbers.
- Unbuilt endpoints return 501 with a `todo`. No mock data.
