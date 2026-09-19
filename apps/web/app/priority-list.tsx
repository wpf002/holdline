"use client";

import { PREFERENCE_NAMES, type PreferenceKey } from "@holdline/types";
import { useState } from "react";

const title = (key: PreferenceKey) =>
  PREFERENCE_NAMES[key].charAt(0).toUpperCase() + PREFERENCE_NAMES[key].slice(1);

/** Drag to reorder, or use the arrow buttons. Most important first. */
export function PriorityList({
  items,
  describe,
  onReorder,
}: {
  items: PreferenceKey[];
  describe: (key: PreferenceKey) => string;
  onReorder: (keys: PreferenceKey[]) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [key] = next.splice(from, 1);
    next.splice(to, 0, key!);
    onReorder(next);
  }

  if (items.length === 0) {
    return <p className="hint">Your preferences show up here once you fill some in.</p>;
  }

  return (
    <ol className="priority-list">
      {items.map((key, i) => (
        <li
          key={key}
          className="priority-item"
          draggable
          data-dragging={dragging === i || undefined}
          data-over={(over === i && dragging !== i) || undefined}
          onDragStart={(e) => {
            setDragging(i);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", key);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(i);
          }}
          onDragLeave={() => setOver((o) => (o === i ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging !== null) move(dragging, i);
            setDragging(null);
            setOver(null);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
        >
          <span className="priority-rank" aria-hidden="true">
            {i + 1}
          </span>
          <div>
            <p className="priority-name">{title(key)}</p>
            <p className="priority-summary">{describe(key)}</p>
          </div>
          <div className="priority-moves">
            <button
              type="button"
              className="icon-button"
              aria-label={`Move ${PREFERENCE_NAMES[key]} up`}
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Move ${PREFERENCE_NAMES[key]} down`}
              disabled={i === items.length - 1}
              onClick={() => move(i, i + 1)}
            >
              ↓
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
