"use client";

import type { BidIntent } from "@holdline/types";
import { useId, useState } from "react";
import { WEEK, calendarWeeks, monthLabel, rangeLabel, shortDay, toggle } from "../lib/draft";
import { Segmented } from "./segmented";

type DaysOff = BidIntent["daysOff"];
type Range = DaysOff["ranges"][number];

const dayAfter = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Adds a block, folding it into any it touches or overlaps so the same days can't stack up. */
function addRange(ranges: Range[], next: Range): Range[] {
  const sorted = [...ranges, next].sort((a, b) => a.start.localeCompare(b.start));
  const merged: Range[] = [];
  for (const r of sorted) {
    const last = merged.at(-1);
    if (last && r.start <= dayAfter(last.end)) last.end = last.end >= r.end ? last.end : r.end;
    else merged.push({ ...r });
  }
  return merged;
}

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
    // Every click is part of picking a block. Blocks come off with the × on their chip, so a
    // click inside one can extend it instead of being read as "undo".
    if (!blockStart) return setBlockStart(iso);
    // Clicking the same day again backs out: one day off belongs on the Single Days tab.
    if (blockStart === iso) return setBlockStart(null);
    const [start, end] = blockStart <= iso ? [blockStart, iso] : [iso, blockStart];
    setBlockStart(null);
    onChange({ ranges: addRange(daysOff.ranges, { start, end }) });
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
            { value: "days", label: "Single Days" },
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
            Clear Days Off
          </button>
        )}
      </div>
      <p className="hint" aria-live="polite">
        {mode === "days"
          ? "Click days in order of importance. The number on a day is its priority; PBS gives up the highest numbers first."
          : blockStart
            ? `Block starts ${shortDay(blockStart)}. Click its last day, or click it again to back out.`
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
          {daysOff.ranges.map((r, i) => (
            <li key={`${r.start}-${r.end}-${i}`} className="chip">
              {rangeLabel(r)}
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove block ${rangeLabel(r)}`}
                onClick={() => onChange({ ranges: daysOff.ranges.filter((_, at) => at !== i) })}
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
