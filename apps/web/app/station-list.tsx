"use client";

import { useId, useState } from "react";

/** Airport codes as removable chips; type one or several, then Enter. */
export function StationList({
  label,
  stations,
  onChange,
}: {
  label: string;
  stations: string[];
  onChange: (stations: string[]) => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const codes = text
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((c) => c.toUpperCase());
    if (!codes.length) return;
    const bad = codes.filter((c) => !/^[A-Z]{3}$/.test(c));
    if (bad.length) {
      setError(`${bad.join(", ")}: use 3-letter airport codes.`);
      return;
    }
    onChange([...new Set([...stations, ...codes])]);
    setText("");
    setError(null);
  }

  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="row">
        <input
          id={id}
          className="input input-narrow"
          value={text}
          placeholder="ORD"
          autoCapitalize="characters"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="button" onClick={add} disabled={!text.trim()}>
          Add
        </button>
      </div>
      {error && (
        <p className="error-text" id={`${id}-error`}>
          {error}
        </p>
      )}
      {stations.length > 0 && (
        <ul className="chips" aria-label={label}>
          {stations.map((s) => (
            <li key={s} className="chip">
              {s}
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${s}`}
                onClick={() => onChange(stations.filter((x) => x !== s))}
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
