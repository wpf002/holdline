# Holdline — instructions for Claude Code

Read this, `README.md`, and `docs/pbs-research.md` before changing anything.

## What we're building

Airline crew bid monthly schedules through a PBS (Preferential Bidding System). They don't rank pre-built lines anymore; they write a bid in the vendor's rule language and an optimizer awards pairings in seniority order. Most crews find this confusing. Holdline takes what they want in plain terms (days off, trip length, report times, layovers, credit) and produces a correctly ordered bid for their airline's PBS, plus a click-by-click entry checklist.

First user: a regional pilot (likely Envoy or Piedmont, both NAVBLUE, PBS new in 2025–26) who used QuickBid ($4.99/mo) under line bidding. Must work for any airline.

## Domain model

- **Pairing** (a.k.a. trip/sequence): multi-day assignment starting and ending at base. Has credit, TAFB, report/release, layovers, legs.
- **Bid period**: one month's pairings for one base.
- **Credit window**: min/max monthly credit the line must land in.
- **Seniority**: bids are processed most senior first. Junior crew get what's left.
- **Relaxation**: if a strict bid can't be filled, PBS moves to the next bid group/layer. A good bid degrades gracefully: strictest wishes first, then drop the least important one per group.

## Three bid dialects (compile targets)

| Dialect | Vendors | Shape |
|---|---|---|
| `ORDERED_GROUPS` | NAVBLUE (Delta, JetBlue, Alaska, Frontier, Spirit, Hawaiian, Envoy, Piedmont, GoJet…), Jeppesen (United pilots) | Bid groups of ordered lines. Order = priority. Negative lines remove pairings from the pool for lines below |
| `LAYERED` | American (pilots + APFA), AOS (SkyWest) | 7 cumulative layers. Days-off / pairing / line properties. OR within a property, AND across |
| `WEIGHTED` | IBS/AD OPT (Air Canada, FedEx, PSA, Endeavor, WestJet, Republic) | Desire/avoid with scoring. Syntax unconfirmed. Build last |

NAVBLUE line types (colour in their UI): `Prefer Off` (yellow), `Avoid Pairings If…` (orange), `Award Pairings If…` (green), `Set Condition` (purple, must be above Award lines), `Waive` (light blue), instructions (blue: `Clear Schedule and Start Next Bid Group`, `Forget Line`, `Redo from Line`). Each pairing group starts with a system `Start Pairings` line and ends with a system `Award Pairings` line. Reserve groups (`Start Reserve`) go below all pairing groups. Full property list in `docs/pbs-research.md`.

## Architecture

```
plain English ──(phase 2, Anthropic tool use)──> BidIntent (packages/types)
                                                     │
                     airline + crew group ─> PbsDeployment (vendor, dialect, config)
                                                     │
                                  packages/core compile(intent, vendor)
                                                     │
                     CompiledBid { groups[].lines[].text + uiPath, warnings, syntaxVerified }
                                                     │
                        (phase 3) pool preview against imported pairings
```

- `packages/core` is pure: no DB, no network. Everything else calls it.
- Relaxation logic is shared (`core/src/relax.ts`): group N = all preferences minus the last N-1 entries of `intent.priorities`. Final group always = hard constraints only + award all. Cap by `PbsDeployment.config.maxGroups`.
- Each vendor compiler maps canonical fields to vendor wording via a label table (`core/src/compilers/<vendor>/labels.ts`). Unsupported fields become warnings, never silent drops.
- Airline-specific overrides (labels, limits, waiver names) live in `PbsDeployment.config` JSON so fixing a label doesn't need a deploy.

## Build order

1. **NAVBLUE compiler.** `core/src/relax.ts`, `core/src/compilers/navblue/*`, register in `compile()`. Golden tests in `core/src/compilers/navblue/*.test.ts` built from the NAVBLUE KB sample bids and the Air Canada guide examples in the research doc. Wire `POST /bids/compile` (validate with zod, look up deployment, 400 on bad intent, 501 on `UnsupportedVendorError`).
2. **Web wizard + parser.** QuickBid-style form in `apps/web` (days off calendar, trip length, report/release, layovers, credit, priority drag-order) that produces a `BidIntent`. Then `POST /bids/parse`: Anthropic tool use whose tool input schema is `BidIntent` (zod -> JSON schema), returns intent + clarifying questions. The form is the source of truth; parsing only pre-fills it.
3. **Output view.** Bid groups rendered like the vendor screen (colour-coded line types), copy button per line, entry checklist from `uiPath`, warnings banner when `syntaxVerified` is false.
4. **Pairing import + pool preview.** Parser for whatever pairing export the first user can provide (drop samples in `data/private/`). Show matching pairing counts per line, like NAVBLUE's Bid Analyzer.
5. **Jeppesen + LAYERED compilers.**
6. **Hold estimates** from `AwardRecord` (what's realistic at this seniority).
7. Auth (magic link), Stripe subscription, saved/default bids.
8. IBS/AD OPT once real syntax is sourced.

## Hard rules

- Never automate login to or submission into an airline PBS. United's IT explicitly bans automated entry; assume every airline does. Output is manual-entry only.
- Never store airline credentials.
- Pilot data files stay out of git (`data/private/`). Strip employee numbers before anything is saved.
- `syntaxVerified: true` only after comparing against a real screen or an official guide; cite the source in the label file.
- No mock data behind real endpoints. Unbuilt = 501 with `todo`.
- Run `pnpm typecheck && pnpm test && pnpm build` before calling anything done.

## Open questions (waiting on the first user)

- Airline and confirmation it's NAVBLUE.
- Can he export the monthly pairing file? Format?
- Screenshots of his bid entry screen and a past award report (employee # removed).
