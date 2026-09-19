"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { deleteBid, listBids, makeDefaultBid, type SavedBidSummary } from "../../lib/api";
import { monthLabel } from "../../lib/draft";
import { useAccount } from "../../lib/use-account";

const CREW = { PILOT: "Pilot", FLIGHT_ATTENDANT: "Flight attendant" } as const;

export function SavedBids({ apiUrl }: { apiUrl: string }) {
  const { account, loading } = useAccount(apiUrl);
  const [bids, setBids] = useState<SavedBidSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listBids(apiUrl);
    if (res.ok) setBids(res.data.bids);
    else setError(res.message);
  }, [apiUrl]);

  useEffect(() => {
    if (account) void load();
  }, [account, load]);

  async function act(action: Promise<{ ok: boolean; message?: string }>) {
    const res = await action;
    if (!res.ok) setError(res.message ?? "That didn't work.");
    await load();
  }

  if (loading) return <p className="hint">Loading…</p>;
  if (!account) {
    return (
      <div className="notice narrow">
        <p className="notice-title">You&apos;re not signed in</p>
        <p>
          <Link href="/login">Sign in</Link> to see your saved bids.
        </p>
      </div>
    );
  }
  if (!bids) return <p className="hint">Loading your bids…</p>;

  return (
    <div className="stack narrow">
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {bids.length === 0 ? (
        <div className="bid-empty">
          <p>No saved bids yet.</p>
          <p>
            <Link href="/">Build a bid</Link>, then save it from the Your bid panel.
          </p>
        </div>
      ) : (
        <ul className="priority-list">
          {bids.map((b) => (
            <li key={b.id} className="saved-bid">
              <div className="saved-bid-main">
                <p className="priority-name">
                  {b.name ?? monthLabel(b.month)}
                  {b.isDefault && <span className="tag">Default</span>}
                </p>
                <p className="priority-summary">
                  {monthLabel(b.month)} · {b.airline} {CREW[b.crewGroup]} · {b.base} · saved{" "}
                  {new Date(b.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="actions">
                <Link className="button" href={`/?bid=${encodeURIComponent(b.id)}`}>
                  Open
                </Link>
                {!b.isDefault && (
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => act(makeDefaultBid(apiUrl, b.id))}
                  >
                    Make default
                  </button>
                )}
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => {
                    if (window.confirm(`Delete "${b.name ?? monthLabel(b.month)}"?`)) {
                      void act(deleteBid(apiUrl, b.id));
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
