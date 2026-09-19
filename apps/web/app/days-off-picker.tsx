"use client";

import type { BidIntent } from "@holdline/types";
import { useId, useState } from "react";
import { WEEK, calendarWeeks, monthLabel, rangeLabel, shortDay, toggle } from "../lib/draft";
import { Segmented } from "./segmented";

type DaysOff = BidIntent["daysOff"];

export function DaysOffPicker({
  month,
  daysOff,
  onChange,
}: {
  month: string;
  daysOff: DaysOff;
  onChange: (patch: Partial<DaysOff>) => void;
}) {
  const weekdaysLabel = useId();
  const [mode, setMode] = useState<"days" | "blocks">("days");
  const [blockStart, setBlockStart] = useState<string | null>(null);
  const inBlock = (iso: string) => daysOff.ranges.some((r) => iso >= r.start && iso <= r.end);

  function pick(iso: string) {
    if (mode === "days") return onChange({ dates: toggle(daysOff.dates, iso) });
    if (!blockStart) return setBlockStart(iso);
    const [start, end] = blockStart <= iso ? [blockStart, iso] : [iso, blockStart];
    onChange({ ranges: [...daysOff.ranges, { start, end }] });
    setBlockStart(null);
  }

  const hasAny =
    daysOff.dates.length + daysOff.ranges.length + daysOff.daysOfWeek.length > 0 ||
    daysOff.weekends;

  return (
    <div className="group">
      <div className="row">
        <Segmented
          label="Pick"
          value={mode}
          options={[
            { value: "days", label: "Single days" },
            { value: "blocks", label: "Blocks" },
          ]}
          onChange={(m) => {
            setMode(m);
            setBlockStart(null);
          }}
        />
        {hasAny && (
          <button
            type="button"
            className="button button-quiet"
            onClick={() => onChange({ dates: [], ranges: [], daysOfWeek: [], weekends: false })}
          >
            Clear days off
          </button>
        )}
      </div>
      <p className="hint" aria-live="polite">
        {mode === "days"
          ? "Click days in order of importance. The number on a day is its priority; PBS gives up the highest numbers first."
          : blockStart
            ? `Block starts ${shortDay(blockStart)}. Click its last day.`
            : "Click the first and last day of a block you want off together."}
      </p>

      <div className="calendar" role="group" aria-label={`Days off in ${monthLabel(month)}`}>
        {WEEK.map((w) => (
          <span key={w.key} className="calendar-head" aria-hidden="true">
            {w.short}
          </span>
        ))}
        {calendarWeeks(month)
          .flat()
          .map((iso, i) => {
            if (!iso) return <span key={`pad-${i}`} />;
            const rank = daysOff.dates.indexOf(iso) + 1;
            const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
            const weekday = WEEK[dow]!.long;
            const state = blockStart === iso ? "pending" : inBlock(iso) ? "range" : undefined;
            const extra = rank
              ? `, off, priority ${rank}`
              : state === "range"
                ? ", in a block off"
                : "";
            return (
              <button
                key={iso}
                type="button"
                className="day"
                aria-pressed={rank > 0}
                aria-label={`${weekday} ${shortDay(iso)}${extra}`}
                data-state={state}
                data-weekend={dow === 0 || dow === 6 || undefined}
                onClick={() => pick(iso)}
              >
                {Number(iso.slice(8))}
                {rank > 0 && (
                  <span className="rank" aria-hidden="true">
                    {rank}
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {daysOff.ranges.length > 0 && (
        <ul className="chips" aria-label="Blocks off">
          {daysOff.ranges.map((r) => (
            <li key={`${r.start}-${r.end}`} className="chip">
              {rangeLabel(r)}
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove block ${rangeLabel(r)}`}
                onClick={() => onChange({ ranges: daysOff.ranges.filter((x) => x !== r) })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="field">
        <span className="label" id={weekdaysLabel}>
          Days of the week off
        </span>
        <div className="chips" role="group" aria-labelledby={weekdaysLabel}>
          {WEEK.map((w) => {
            const rank = daysOff.daysOfWeek.indexOf(w.key) + 1;
            return (
              <button
                key={w.key}
                type="button"
                className="toggle-chip"
                aria-pressed={rank > 0}
                aria-label={rank ? `${w.long}, priority ${rank}` : w.long}
                onClick={() => onChange({ daysOfWeek: toggle(daysOff.daysOfWeek, w.key) })}
              >
                {w.short}
                {rank > 0 && (
                  <span className="rank" aria-hidden="true">
                    {rank}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={daysOff.weekends}
          onChange={(e) => onChange({ weekends: e.target.checked })}
        />
        <span>As many full weekends off as possible</span>
      </label>
    </div>
  );
}
