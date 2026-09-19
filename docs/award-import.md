# Award import and hold estimates

`POST /awards/import` loads one past bid period's award results so `/bids/compile` can say how far
down the seniority list lines and matching pairings went. An import replaces the previous one for
the same airline, crew group, base and month.

```json
{
  "airline": "ENY",
  "crewGroup": "PILOT",
  "base": "DFW",
  "month": "2026-09",
  "format": "holdline-awards-csv",
  "data": "<file contents>"
}
```

Response: `{ "imported": 412, "errors": [{ "line": 9, "message": "..." }] }`. If nothing in the file
is usable the API answers 422.

## `holdline-awards-csv`

One row per awarded pairing, or one row per line when the report only has line totals. Header names
are case-insensitive and can be in any order.

| Column        | Required       | Format                                                     |
| ------------- | -------------- | ---------------------------------------------------------- |
| `seniority`   | yes            | Seniority number in the bid category; lower is more senior |
| `pairing`     | no             | Awarded pairing number. Needs `start_date`                 |
| `start_date`  | with `pairing` | Pairing report date, `YYYY-MM-DD`                          |
| `line_credit` | no             | Line credit, `H:MM`                                        |
| `reserve`     | no             | `Y`/`N` (also yes/no, true/false, 1/0)                     |

Every other column, including names and employee numbers, is ignored and never stored. Award rows
match pairings by number and date, so import that month's pairings too
([pairing-import.md](pairing-import.md)).

## Estimates

`estimateHolds` (`packages/core/src/awards/holds.ts`) uses up to three imported months before the bid
month:

- Per month, the most junior seniority awarded a line and the most senior awarded reserve.
- Per bid line that asks for pairings (Award lines, layered properties that keep or prefer) and
  means the same in any month (trip length, report/release times, layovers, weekdays): the most
  junior seniority awarded a matching pairing, and how many were awarded.

Lines about specific dates or that remove pairings get no estimate. With the bidder's seniority
(`seniority` in the `/bids/compile` body), the web app says whether each cutoff was within reach.
