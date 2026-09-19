"use client";

import type { BidIntent } from "@holdline/types";
import { useId, useState } from "react";
import { monthBounds, shortDay } from "../lib/draft";

/** A select of whole numbers where "Any" means the field is unset. */
export function NumberSelect({
  label,
  value,
  options,
  anyLabel = "Any",
  onChange,
}: {
  label: string;
  value: number | undefined;
  options: number[];
  anyLabel?: string;
  onChange: (value: number | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="select"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      >
        <option value="">{anyLabel}</option>
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="time"
        className="input input-narrow"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}

type CreditRange = NonNullable<BidIntent["line"]["creditMinutes"]>;
const toHours = (minutes: number | undefined) =>
  minutes === undefined ? "" : String(Math.round((minutes / 60) * 100) / 100);

/**
 * Credit window in hours. Keeps its own text so a half-typed range doesn't wipe the inputs;
 * the parent remounts it (key) when the parser fills the form.
 */
export function CreditInputs({
  value,
  onChange,
}: {
  value: CreditRange | undefined;
  onChange: (value: CreditRange | undefined) => void;
}) {
  const id = useId();
  const [low, setLow] = useState(toHours(value?.min));
  const [high, setHigh] = useState(toHours(value?.max));
  const lo = Number(low);
  const hi = Number(high);
  const complete = low !== "" && high !== "" && Number.isFinite(lo) && Number.isFinite(hi);
  const backwards = complete && lo > hi;

  function commit(nextLow: string, nextHigh: string) {
    setLow(nextLow);
    setHigh(nextHigh);
    const a = Number(nextLow);
    const b = Number(nextHigh);
    const ok = nextLow !== "" && nextHigh !== "" && a >= 0 && b >= a;
    onChange(ok ? { min: Math.round(a * 60), max: Math.round(b * 60) } : undefined);
  }

  return (
    <fieldset className="fieldset">
      <legend className="label">Monthly credit (hours)</legend>
      <div className="row">
        <div className="field">
          <label className="hint" htmlFor={`${id}-low`}>
            From
          </label>
          <input
            id={`${id}-low`}
            className="input input-narrow"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            value={low}
            aria-invalid={backwards || undefined}
            onChange={(e) => commit(e.target.value, high)}
          />
        </div>
        <div className="field">
          <label className="hint" htmlFor={`${id}-high`}>
            To
          </label>
          <input
            id={`${id}-high`}
            className="input input-narrow"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            value={high}
            aria-invalid={backwards || undefined}
            onChange={(e) => commit(low, e.target.value)}
          />
        </div>
      </div>
      {backwards && <p className="error-text">Put the lower number first.</p>}
    </fieldset>
  );
}

type Pairing = BidIntent["pairings"]["specific"][number];

/** Pairings to bid for by number and departure date. */
export function SpecificPairings({
  month,
  pairings,
  onChange,
}: {
  month: string;
  pairings: Pairing[];
  onChange: (pairings: Pairing[]) => void;
}) {
  const id = useId();
  const { first, last } = monthBounds(month);
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("");
  const inMonth = date >= first && date <= last;
  const canAdd = number.trim() !== "" && inMonth;

  function add() {
    if (!canAdd) return;
    onChange([...pairings, { number: number.trim().toUpperCase(), date }]);
    setNumber("");
    setDate("");
  }

  return (
    <div className="group">
      <div className="row">
        <div className="field">
          <label className="label" htmlFor={`${id}-number`}>
            Pairing number
          </label>
          <input
            id={`${id}-number`}
            className="input input-narrow"
            value={number}
            autoComplete="off"
            onChange={(e) => setNumber(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-date`}>
            Departs
          </label>
          <input
            id={`${id}-date`}
            className="input"
            type="date"
            min={first}
            max={last}
            value={date}
            aria-invalid={(date !== "" && !inMonth) || undefined}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <button type="button" className="button" onClick={add} disabled={!canAdd}>
          Add pairing
        </button>
      </div>
      {date !== "" && !inMonth && <p className="error-text">Pick a date in the bid month.</p>}
      {pairings.length > 0 && (
        <ul className="chips" aria-label="Pairings to bid for">
          {pairings.map((p) => (
            <li key={`${p.number}-${p.date}`} className="chip">
              {p.number} on {shortDay(p.date)}
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove pairing ${p.number} on ${shortDay(p.date)}`}
                onClick={() => onChange(pairings.filter((x) => x !== p))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
