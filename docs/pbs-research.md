# PBS research (Sept 2026)

Confidence: **C** = a source names carrier + vendor. **3P** = only a third-party coaching site (pbswizard.com) says so. **I** = inferred.

## Airline -> vendor

| Airline | Crew | Vendor | Notes | Conf |
|---|---|---|---|---|
| Delta | Pilots / FAs | NAVBLUE | | C / 3P |
| United | Pilots | Jeppesen | ~2006 | C |
| United | FAs | Line bidding | PBS dropped from Mar 2026 TA | C |
| American | Pilots / FAs | Unnamed, 7-layer | pilotpbs.aa.com; APFA guide | I |
| JetBlue | Pilots / FAs | NAVBLUE | | C / 3P |
| Alaska | Pilots / FAs | NAVBLUE | ClassBid retired 2022 | C |
| Hawaiian | Pilots / FAs | NAVBLUE | halpbs.navblue.aero | 3P |
| Allegiant | FAs | NAVBLUE | 2022 | C |
| Frontier, Spirit, GoJet | Pilots / FAs | NAVBLUE | | 3P |
| Envoy | Pilots / FAs | NAVBLUE | New 2025–26 | 3P / C |
| Piedmont | Pilots / FAs | NAVBLUE (likely) | PBS LOAs 2025 | C (PBS) / 3P |
| PSA, Endeavor, FedEx, WestJet, WestJet Encore, Air Canada pilots | Pilots | IBS / AD OPT | | C |
| Republic | Pilots / FAs | IBS | Selected Oct 2024 | C |
| SkyWest | Pilots / FAs | AOS | swprefbid.com/aospbs | I |
| Air Canada | FAs | NAVBLUE | acapbs.navblue.aero | C |
| Southwest | Pilots / FAs | Line bidding | | C / I |

Unknown: Mesa, Sun Country, Breeze, Avelo, UPS, Atlas, Porter, Jazz.

## NAVBLUE N-PBS (formerly Navtech / ClassBid)

**Structure.** Bid = bid groups; group = ordered bid lines. Pairing group opens with system `Start Pairings`, closes with system `Award Pairings` (awards any remaining pairings). Reserve groups open with `Start Reserve`; `Start Reserve Bid` jumps to the first reserve group. All pairing groups sit above all reserve groups. Air Canada limits: 150 lines, 10 "If" clauses per line. Current Bid vs Default Bid.

**Line types**
- `Prefer Off` — dates/days of week (order = priority), date ranges (reverse priority option), weekends, time range, `All or Nothing`, `Else Start Next Bid Group`.
- `Avoid Pairings If …` — removes from pool.
- `Award Pairings If …` — adds to preferred pool; optional `Limit = n`.
- `Set Condition` — group-wide, above Award lines: Award ER On, Consecutive Days Off In A Row, Days Off Opposite/With Employee, Group Label, Group Vacation Codes, Maximum Credit Window, Maximum Days On, Maximum TFP, Maximum UDO, Minimum 2 Days Off, Minimum 2 Required Days Off, Minimum Base Layover, Minimum Credit Window, Minimum Days Off In A Row, Over Schedule, Pattern, Reserve GDO Type, Slide Vacation, Vacation Any/Extension/GDO, Waive Training Credit, Waive Virtual Credit.
- `Waive` — e.g. 1-in-7, 4-in-14, Max 5 Day Workblock (reserve).
- Instructions — `Clear Schedule and Start Next Bid Group`, `Forget Line`, `Redo from Line`.

**Award/Avoid "If" criteria:** Allowance Amount; Average Daily Block/Credit/TFP; Block/Credit/TFP per TAFB %; Carry Out (+ block/credit); Deadhead Day; Depart on Date / Date Range / Day of Week / Time Range; Junior; Senior; Pairing Check-In Station; Pairing Total Credit; Position; TAFB; Time Off Before and After; Total Legs in First Duty / Last Duty / Pairing; All Aircraft; Duty Duration; Enroute Check-In/Out; Layovers In; Landings In; Pairing Length; Pairing Check-In Time; Sit Length; Pairing Number. Qualifiers: `Any` / `Every`, `If Not`, `>` `<` `=` `Between`.

**Examples (verbatim)**
```
Award Pairings If Departing on October 15, 2013 If Layover In YYC If Pairing Length = 2 days
Avoid Pairings If Pairing Check-In Time Between 01:00 and 06:00
Avoid Pairings If Average Daily Credit < 004:00
Award Pairings If Departing on Monday, Tuesday
Prefer Off Oct 25, 24, 23, 22, 21
Prefer Off Dec 14, 2011 - Dec 17, 2011
```

**Processing.** Seniority order, per base. Lines top-down; negatives shrink the pool for lines below. If the block isn't complete: shuffling, then Denial Mode (drops Set Condition / Prefer Off / Avoid lines bottom-up; multi-date lines lose dates right-to-left), then coverage awards, then Secondary Line Generation. `Minimum Credit Window` stops PBS adding a pairing just to reach the window.

PBS moves to the next bid group only through `Else Start Next Bid Group` (on Prefer Off / Avoid / some Set Conditions) or `Clear Schedule and Start Next Bid Group`, and both discard pairings awarded so far (Air Canada guide p.4-11; KB 35000203471, 35000204819). Without them, Denial Mode runs inside the current group. `Minimum` / `Maximum Credit Window` are flags with no hours: the bidder picks one of the airline's published windows (Envoy AFA p.31, 34; Air Canada guide p.5-55). Envoy FA windows: minimum 65–91, normal 75–91, maximum 91–110 h (Envoy AFA p.7). Envoy's 2025 screen labels the group header `Pairing Bid Group` and lists waivers `Minimum 2 Days Off In A Row`, `No Same Day Pairings`, `1 Day Off in 7` (Envoy AFA p.29, 34).

**UI.** Left nav INFO / CALENDAR / PAIRINGS / BIDS / RESULTS. Bid Preference Editor: type-ahead multi-select, time/number spinners, calendar picker, Apply disabled until required fields filled. Bid Analyzer tabs: Matching Bid Line, Removed From Pool, Filtered Pool, Added To Potential Awards, Total Potential Awards. Results: Awards + Reasons Report.

## Jeppesen (United pilots)

Up to 20 bid groups; upper-case statements `AWARD`, `AVOID`, `SET`, `WAIVE`; groups progressively relax. No floating "any N days off" — specific dates. Web UI only; UAL IT bans automated entry. Newer platform adds guided steps and AutoBid.
```
WAIVE Min days between work blocks 1
WAIVE 1 in 7 Day Off in Base
AVOID Work 07 Apr -- 17 Apr
AWARD Work 01 Apr 0001 -- 30 Apr 2359 (L-)
```

## Layered (American, AOS/SkyWest)

7 cumulative layers; tabs Pairing / LH Days Off / Line. Max 300 bids/month (AA). OR within a property, AND across. Line property kinds: persistent, single-use per layer (Target Credit Range, Work Block Size, Cadence, Commutable Work Block), restrictive (can't tighten later without Clear Bids).
- Days off: Min/Max Weekend Days Off, Maximize Total Days Off, Maximize Block of Days Off, String of Days Off Starting/Ending on Date, Waive Minimum Days Off, Minimum Days Off Between Work Blocks.
- Pairing: Prefer Pairing Length / Duty Period / Type, Prefer/Avoid Deadheads, Landing at City, Aircraft, Report Between, Release Between, Layover at City (+ on Date, Avoid), Min/Max Layover Time, Max TAFB-credit ratio, Min Avg Credit per Duty, Max Duty/Block per Duty, Min/Max Connection, Max Landings per Duty.
- Line: Target Credit Range (default 70–90, allowed 40–110), Maximize Credit, Work Block Size, Pairing Mix, Cadence on Day-of-Week, Commutable Work Block, Allow Double-Up / Multiple Pairings, Waive rest rules, Avoid Person, Buddy With, Clear Bids.
- AOS notation: `OFF1`, `OFFW1`; award codes `P1..P7`, `PN`, `CN`.

## IBS / AD OPT

Desire/Avoid preferences scored by a Pairing Analyzer (Endeavor AFA). Exact syntax needs a member-only handbook (ACPA, FedEx ALPA, PSA ALPA).

## Existing tools

| Tool | Airlines | Price | What |
|---|---|---|---|
| PathBids (iOS) | United | Subscription | AI plain English -> bid groups |
| Bidliner | AA pilots | ~$9.99/mo | Hold predictions, Batch Bid, Chrome extension |
| ProBid Plus | United | Free | Dropdown -> bid groups |
| BidNav | United | ~$600/yr | AutoBid |
| PBS Wizard | NAVBLUE carriers | $60/bid | Human service |
| PBS Bidding Strategies | Delta, Frontier, Spirit, Alaska, Mesa, GoJet | Monthly | Done-for-you |

Gap: nothing self-serve across vendors, nothing for NAVBLUE regionals.

## Sources

- NAVBLUE KB: https://n-crewplanning.support.navblue.aero/support/solutions/35000142241 (editor, analyzer, set conditions, denial mode, sample bids)
- Envoy AFA Generic Basic Bid: https://afaeagle.com/system/files/2025-08/pbs_generic_basic_bid.pdf
- Air Canada Navtech Bidder's Guide: https://accomponent.ca/wp-content/uploads/2021/02/PBS_Bidder_Guide_FINAL_Eng-Apr-2015.pdf
- Delta PBS Reference Handbook: https://dal.alpa.org/Portals/1/adam/Content/bcLKy1q3FkC5kBgi0bKztg/Link/PBS%20Reference%20Handbook.pdf
- N-PBS Bidder's Guide: https://dal.alpa.org/Portals/1/Documents/committees/pbs/other/navblue-pbs-bidder-guide.pdf
- Frontier ALPA PBS Handbook: https://fft.alpa.org/Portals/94/Documents/committees/pbs-resources/pbs-handbook/Frontier-ALPA-PBS-Handbook.pdf
- APFA FA PBS Guide: https://www.apfa.org/wp-content/uploads/2019/01/Flight-Attendant-PBS-Guide_10JAN19.pdf
- SkyWest AOS docs: https://www.swprefbid.com/aospbs/online_docs_SKYW.html
- ProBid Plus guide: http://probidplus.com/downloads/ProBid_Plus_User_Guide.pdf
- Jeppesen PBS guide v5.30: http://prefbid.com/forum/documents/pbs_user_guide_v5.30.pdf
- ALPA 2026: https://www.alpa.org/articles/2026/06/pilot-schedulers-compare-pbs-notes
- Republic/IBS: https://www.prnewswire.com/news-releases/republic-airways-selects-ibs-software-for-next-generation-crew-schedule-bidding-302275285.html
- Endeavor AFA: https://edvafa.org/pbs-bidding-help
- Bidliner: https://www.bidliner.com/ · PathBids: https://apps.apple.com/in/app/pathbids/id6720759666 · PBS Wizard: https://www.pbswizard.com/
