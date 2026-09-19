"use client";

import type { BidIntent } from "@holdline/types";
import Link from "next/link";
import { useId, useState } from "react";
import { saveBid, type AccountInfo } from "../lib/api";
import { monthLabel } from "../lib/draft";

/** Save the built bid to the account, optionally as the default to start from each month. */
export function SaveBid({
  apiUrl,
  account,
  intent,
}: {
  apiUrl: string;
  account: AccountInfo | null;
  intent: BidIntent;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!account) {
    return (
      <p className="hint">
        <Link href="/login">Sign in</Link> to save this bid and start from it next month.
      </p>
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveBid(apiUrl, { intent, name: name.trim() || null, isDefault });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setDone(res.data.bid.name ?? monthLabel(res.data.bid.month));
  }

  if (done) {
    return (
      <p className="hint" role="status">
        Saved &ldquo;{done}&rdquo;{isDefault ? " as your default" : ""}.{" "}
        <Link href="/bids">My bids</Link>
      </p>
    );
  }

  return (
    <div className="group">
      <div className="row">
        <div className="field">
          <label className="label" htmlFor={id}>
            Save as
          </label>
          <input
            id={id}
            className="input"
            value={name}
            maxLength={80}
            placeholder={`${monthLabel(intent.month)} bid`}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button type="button" className="button" onClick={save} disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save bid"}
        </button>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        <span>Make it my default: next month&apos;s form starts from it, without the dates</span>
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
