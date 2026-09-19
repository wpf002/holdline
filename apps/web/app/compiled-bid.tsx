"use client";

import type { CompiledBid, CompiledLine } from "@holdline/types";
import { useState } from "react";
import { VENDOR_NAMES } from "../lib/api";

const KIND_LABELS: Record<CompiledLine["kind"], string> = {
  SYSTEM: "Bid group",
  SET: "Set Condition",
  PREFER_OFF: "Prefer Off",
  AVOID: "Avoid",
  AWARD: "Award",
  WAIVE: "Waive",
  INSTRUCTION: "Instruction",
  PROPERTY: "Property",
};

/** System lines with no entry steps (a pairing group's closing Award Pairings) exist on their own. */
const automatic = (line: CompiledLine) => line.kind === "SYSTEM" && line.uiPath.length === 0;

/** Line numbers as the bid screen shows them: every line except the automatic ones. */
function numberLines(bid: CompiledBid): (number | null)[][] {
  let n = 0;
  return bid.groups.map((g) => g.lines.map((l) => (automatic(l) ? null : ++n)));
}

function asText(bid: CompiledBid): string {
  const numbers = numberLines(bid);
  return bid.groups
    .flatMap((g, gi) => [
      g.label,
      ...g.lines.map((l, li) => `${numbers[gi]![li] ?? " "}  ${l.text}`),
      "",
    ])
    .join("\n")
    .trim();
}

export function CompiledBidView({ bid, stale }: { bid: CompiledBid; stale: boolean }) {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const numbers = numberLines(bid);
  const total = numbers.flat().filter((n) => n !== null).length;

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      setCopied(null);
    }
  }

  function toggleDone(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="stack">
      {stale && (
        <p className="notice" role="status">
          You changed the form after building this bid. Build it again to update it.
        </p>
      )}
      {!bid.syntaxVerified ? (
        <div className="notice notice-warning">
          <p className="notice-title">Check each line against your bid screen</p>
          <p>
            Holdline hasn&apos;t compared this wording with {VENDOR_NAMES[bid.vendor]}&apos;s screen
            for your airline yet. Menu names and labels can differ.
          </p>
          {bid.warnings.length > 0 && (
            <ul>
              {bid.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        bid.warnings.length > 0 && (
          <div className="notice notice-warning">
            <ul>
              {bid.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )
      )}

      <div className="actions">
        <p className="progress" aria-live="polite">
          {done.size} of {total} lines entered
        </p>
        <button type="button" className="button" onClick={() => copy("all", asText(bid))}>
          {copied === "all" ? "Copied" : "Copy whole bid"}
        </button>
      </div>

      {bid.groups.map((group, gi) => (
        <section key={group.label} className="bid-group" aria-label={group.label}>
          <h3>{group.label}</h3>
          <ol className="bid-lines">
            {group.lines.map((line, li) => {
              const id = `${gi}-${li}`;
              const n = numbers[gi]![li];
              if (n === null) {
                return (
                  <li key={id} className="bid-line bid-line-system" data-kind={line.kind}>
                    <span />
                    <span />
                    <div className="bid-body">
                      <p className="bid-text">{line.text}</p>
                      <p className="hint">Added automatically.</p>
                    </div>
                  </li>
                );
              }
              return (
                <li key={id} className="bid-line" data-kind={line.kind} data-done={done.has(id)}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={done.has(id)}
                      onChange={() => toggleDone(id)}
                      aria-label={`Line ${n} entered`}
                    />
                  </label>
                  <span className="bid-num">{n}</span>
                  <div className="bid-body">
                    <p className="bid-kind">{KIND_LABELS[line.kind]}</p>
                    <p className="bid-text">{line.text}</p>
                    <ol className="bid-steps" aria-label={`Steps for line ${n}`}>
                      {line.uiPath.map((step, si) => (
                        <li key={si}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  {line.kind !== "SYSTEM" && (
                    <button
                      type="button"
                      className="button button-quiet"
                      aria-label={`Copy line ${n}`}
                      onClick={() => copy(id, line.text)}
                    >
                      {copied === id ? "Copied" : "Copy"}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
