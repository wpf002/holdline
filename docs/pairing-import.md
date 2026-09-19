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
