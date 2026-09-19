"use client";

import type { BidIntent, ImportResponse, PairingFormat } from "@holdline/types";
import { useId, useState } from "react";
import { importPairings, type AirlineOption } from "../../lib/api";
import { monthLabel } from "../../lib/draft";
import { Section } from "../section";
import { Segmented } from "../segmented";

type Crew = BidIntent["crewGroup"];

const FORMATS: { value: PairingFormat; label: string }[] = [
  { value: "holdline-csv", label: "CSV" },
  { value: "holdline-json", label: "JSON" },
];

export function ImportForm({
  airlines,
  apiUrl,
  months,
}: {
  airlines: AirlineOption[];
  apiUrl: string;
  months: string[];
}) {
  const ids = { airline: useId(), base: useId(), month: useId(), file: useId() };
  const [airline, setAirline] = useState("");
  const [crewGroup, setCrewGroup] = useState<Crew>("PILOT");
  const [base, setBase] = useState("");
  const [month, setMonth] = useState(months[1] ?? months[0]!);
  const [format, setFormat] = useState<PairingFormat>("holdline-csv");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const crews = airlines.find((a) => a.code === airline)?.deployments.map((d) => d.crewGroup) ?? [];

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
          ? "Choose a pairing file."
          : null;
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await importPairings(apiUrl, {
      airline,
      crewGroup,
      base: base.toUpperCase(),
      month,
      format,
      data: await file!.text(),
    });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setResult(res.data);
  }

  return (
    <div className="stack narrow">
      <Section id="period-title" step="01" title="Bid period">
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
        step="02"
        title="Pairing file"
        hint="Holdline reads its own CSV or JSON format for now. CSV columns: pairing, start_date (YYYY-MM-DD), days, credit (H:MM), and optionally tafb, report and release (HH:MM) and layovers (codes separated by spaces). Other columns are ignored and never stored, so leave out names and employee numbers."
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
              accept=".csv,.json,text/csv,application/json"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Segmented label="Format" value={format} options={FORMATS} onChange={setFormat} />
        </div>
        <p className="hint">
          Importing replaces any pairings already loaded for this airline, crew, base and month.
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
          {busy ? "Importing…" : "Import pairings"}
        </button>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </div>

      {result && (
        <div className={result.errors.length ? "notice notice-warning" : "notice"} role="status">
          <p className="notice-title">
            Imported {result.imported} pairing{result.imported === 1 ? "" : "s"} for {base}{" "}
            {monthLabel(month)}.
          </p>
          {result.errors.length > 0 && (
            <>
              <p>
                {result.errors.length} problem{result.errors.length === 1 ? "" : "s"} in the file:
              </p>
              <ul>
                {result.errors.slice(0, 20).map((e, i) => (
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
