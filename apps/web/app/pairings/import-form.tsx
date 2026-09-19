"use client";

import type { BidIntent, ImportResponse, PairingFormat } from "@holdline/types";
import { useId, useState } from "react";
import { importAwards, importPairings, type AirlineOption } from "../../lib/api";
import { monthLabel } from "../../lib/draft";
import { Section } from "../section";
import { Segmented } from "../segmented";

type Crew = BidIntent["crewGroup"];
type Kind = "pairings" | "awards";

const FORMATS: { value: PairingFormat; label: string }[] = [
  { value: "holdline-csv", label: "CSV" },
  { value: "holdline-json", label: "JSON" },
];

const FILE_HINTS: Record<Kind, string> = {
  pairings:
    "Holdline reads its own CSV or JSON format for now. CSV columns: pairing, start_date (YYYY-MM-DD), days, credit (H:MM), and optionally tafb, report and release (HH:MM) and layovers (codes separated by spaces). Other columns are ignored and never stored.",
  awards:
    "A CSV of last month's award results, one row per awarded pairing or per line. Columns: seniority, and pairing with start_date, line_credit (H:MM) or reserve (Y/N). Names, employee numbers and every other column are ignored and never stored. Import that month's pairings too, so Holdline can match awards to trips.",
};

export function ImportForm({
  airlines,
  apiUrl,
  months,
  defaultMonth,
  lastMonth,
}: {
  airlines: AirlineOption[];
  apiUrl: string;
  /** Oldest first, from a few months back to the next bid months. */
  months: string[];
  defaultMonth: string;
  lastMonth: string;
}) {
  const ids = { airline: useId(), base: useId(), month: useId(), file: useId() };
  const [kind, setKind] = useState<Kind>("pairings");
  const [airline, setAirline] = useState("");
  const [crewGroup, setCrewGroup] = useState<Crew>("PILOT");
  const [base, setBase] = useState("");
  const [month, setMonth] = useState(defaultMonth);
  const [format, setFormat] = useState<PairingFormat>("holdline-csv");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: Kind; response: ImportResponse } | null>(null);

  const crews = airlines.find((a) => a.code === airline)?.deployments.map((d) => d.crewGroup) ?? [];
  const noun = kind === "pairings" ? "pairing" : "award";

  function chooseKind(next: Kind) {
    setKind(next);
    setResult(null);
    setError(null);
    // Award results are for past months; pairings default to the month being bid.
    setMonth(next === "awards" ? lastMonth : defaultMonth);
  }

  function chooseFile(next: File | null) {
    setFile(next);
    if (next?.name.toLowerCase().endsWith(".json")) setFormat("holdline-json");
    else if (next?.name.toLowerCase().endsWith(".csv")) setFormat("holdline-csv");
  }

  async function upload() {
    const problem = !airline
      ? "Choose your airline."
      : !/^[A-Za-z]{3}$/.test(base)
        ? "Enter your base as a 3-letter code."
        : !file
          ? `Choose ${kind === "pairings" ? "a pairing" : "an award results"} file.`
          : null;
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    setResult(null);
    const period = { airline, crewGroup, base: base.toUpperCase(), month };
    const data = await file!.text();
    const res =
      kind === "pairings"
        ? await importPairings(apiUrl, { ...period, format, data })
        : await importAwards(apiUrl, { ...period, format: "holdline-awards-csv", data });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setResult({ kind, response: res.data });
  }

  return (
    <div className="stack narrow">
      <Section id="kind-title" step="01" title="What you're importing">
        <Segmented
          label="File"
          value={kind}
          options={[
            { value: "pairings", label: "Pairings" },
            { value: "awards", label: "Award results" },
          ]}
          onChange={chooseKind}
        />
        <p className="hint">
          {kind === "pairings"
            ? "A month's pairings for your base. Holdline counts how many each bid line removes."
            : "Past award results for your base. With your seniority, Holdline shows how far down lines and each kind of pairing went."}
        </p>
      </Section>

      <Section id="period-title" step="02" title="Bid period">
        <div className="row">
          <div className="field">
            <label className="label" htmlFor={ids.airline}>
              Airline
            </label>
            <select
              id={ids.airline}
              className="select"
              value={airline}
              onChange={(e) => {
                const code = e.target.value;
                const next =
                  airlines.find((a) => a.code === code)?.deployments.map((d) => d.crewGroup) ?? [];
                setAirline(code);
                if (!next.includes(crewGroup) && next[0]) setCrewGroup(next[0]);
              }}
            >
              <option value="">Choose your airline</option>
              {airlines.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name} ({a.code})
                </option>
              ))}
            </select>
          </div>
          <Segmented
            label="Crew"
            value={crewGroup}
            options={(["PILOT", "FLIGHT_ATTENDANT"] as const).map((c) => ({
              value: c,
              label: c === "PILOT" ? "Pilot" : "Flight attendant",
              disabled: airline !== "" && !crews.includes(c),
            }))}
            onChange={setCrewGroup}
          />
        </div>
        <div className="row">
          <div className="field">
            <label className="label" htmlFor={ids.base}>
              Base
            </label>
            <input
              id={ids.base}
              className="input input-code"
              value={base}
              maxLength={3}
              placeholder="DFW"
              autoComplete="off"
              onChange={(e) => setBase(e.target.value.toUpperCase())}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor={ids.month}>
              Month
            </label>
            <select
              id={ids.month}
              className="select"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section
        id="file-title"
        step="03"
        title={kind === "pairings" ? "Pairing file" : "Award results file"}
        hint={FILE_HINTS[kind]}
      >
        <div className="row">
          <div className="field">
            <label className="label" htmlFor={ids.file}>
              File
            </label>
            <input
              id={ids.file}
              className="input"
              type="file"
              accept={
                kind === "pairings" ? ".csv,.json,text/csv,application/json" : ".csv,text/csv"
              }
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {kind === "pairings" && (
            <Segmented label="Format" value={format} options={FORMATS} onChange={setFormat} />
          )}
        </div>
        <p className="hint">
          Importing replaces any {noun}s already loaded for this airline, crew, base and month.
        </p>
      </Section>

      <div className="actions">
        <button
          type="button"
          className="button button-primary"
          onClick={upload}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "Importing…" : kind === "pairings" ? "Import pairings" : "Import award results"}
        </button>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </div>

      {result && (
        <div
          className={result.response.errors.length ? "notice notice-warning" : "notice"}
          role="status"
        >
          <p className="notice-title">
            Imported {result.response.imported} {result.kind === "pairings" ? "pairing" : "award"}
            {result.response.imported === 1 ? "" : "s"} for {base} {monthLabel(month)}.
          </p>
          {result.response.errors.length > 0 && (
            <>
              <p>
                {result.response.errors.length} problem
                {result.response.errors.length === 1 ? "" : "s"} in the file:
              </p>
              <ul>
                {result.response.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e.line ? `Line ${e.line}: ${e.message}` : e.message}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
