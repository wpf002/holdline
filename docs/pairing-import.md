# Pairing import

`POST /bid-periods/import` loads one bid period (airline, crew group, base, month) so `/bids/compile`
can return pool counts per line. An import replaces the previous one for the same bid period.

```json
{
  "airline": "ENY",
  "crewGroup": "PILOT",
  "base": "DFW",
  "month": "2026-10",
  "format": "holdline-csv",
  "data": "<file contents>"
}
```

Response: `{ "imported": 312, "errors": [{ "line": 14, "message": "..." }] }`. Rows with errors are
skipped; if nothing is usable the API answers 422.

## Formats

### `fos-pdf` / `fos-text`

An airline's FOS bid package as published (Envoy: `DOC_FLT_PBS_<year>_<mon>_<base>_<seat>.pdf`).
Send the PDF base64-encoded as `fos-pdf`; the API reads it into text and parses that. `fos-text` is
the same package already converted, which is what the parser in `core/src/pairings/fos.ts` reads.

One `Pairing` is created per day the block's calendar grid marks, because that's what a crew member
bids on. Carry-in pairings from the previous month are skipped and counted in `errors`. The package
summary also gives the bid period's published line counts and credit windows, which Holdline stores
on the bid period for line odds.

An October ORD captain package: 263 pages, 978 pairings over 1109 operating days, read in about a
second and a half end to end.

Airline exports (NAVBLUE's Pairings tab, Sabre bid packets) don't have readers yet. Each one gets a
reader in `packages/core/src/pairings/file.ts` that produces the same `Pairing` shape
(`packages/types/src/pairing.ts`) once a real sample is in `data/private/`.

### `holdline-csv`

One row per pairing. Header names are case-insensitive and can be in any order. Other columns are
ignored and never stored.

| Column       | Required | Format                                      |
| ------------ | -------- | ------------------------------------------- |
| `pairing`    | yes      | Pairing number, e.g. `D1234`                |
| `start_date` | yes      | Report date, `YYYY-MM-DD`                   |
| `days`       | yes      | Calendar days from report to release        |
| `credit`     | yes      | `H:MM` or `HHH:MM`                          |
| `tafb`       | no       | `H:MM` or `HHH:MM`                          |
| `report`     | no       | First check-in, `HH:MM` local               |
| `release`    | no       | Last check-out, `HH:MM` local               |
| `layovers`   | no       | Airport codes separated by spaces, `;` or ` | `   |

CSV rows have no legs, so red-eye, deadhead and legs-per-duty lines show as "couldn't be checked".

### `holdline-json`

An array of pairings, or `{ "pairings": [...] }`. Adds legs:

```json
{
  "number": "D1234",
  "startDate": "2026-10-05",
  "days": 2,
  "creditMinutes": 780,
  "report": "07:15",
  "release": "11:45",
  "legs": [
    {
      "duty": 1,
      "flight": "3345",
      "from": "DFW",
      "to": "ORD",
      "departs": "2026-10-05T08:00",
      "arrives": "2026-10-05T10:15",
      "deadhead": false
    },
    {
      "duty": 2,
      "from": "ORD",
      "to": "DFW",
      "departs": "2026-10-06T09:00",
      "arrives": "2026-10-06T11:45"
    }
  ]
}
```

Leg times are local to each station. When `layovers` is left out, it's filled from each duty's last
arrival except the final duty's. A leg counts as a red-eye when `redeye` is true, or when it's absent
and the leg arrives on a later date than it departs.

## How counts work

`previewPool` (`packages/core/src/pairings/pool.ts`) walks each bid group top-down like NAVBLUE's Bid
Analyzer. Prefer Off lines remove pairings that work any of the requested days; Avoid lines remove
matching pairings; Award lines count matches in what's left; the closing Award Pairings line shows
what remains. Each bid group starts from the full pool.

## Your own results

`POST /results/import` takes the Reasons report from a past month's Results screen, pasted as text:

```json
{ "airline": "ENY", "crewGroup": "PILOT", "base": "ORD", "month": "2026-09", "data": "…" }
```

The parser reads each numbered bid line, the outcome under it (`Honored`, `Partially honored`,
`Not used`, `Maximum number of bidders reached`, anything else kept verbatim), the awarded reserve
days and the closing `Line Complete No Other Bids Required`. `/bids/compile` returns the newest
month it has as `lastResults`, and the bid view shows each outcome next to the same line this month
when the wording hasn't changed. Nothing else from that screen is read or stored.
