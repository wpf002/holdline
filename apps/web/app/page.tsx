import type { AirlineOption } from "../lib/api";
import { bidMonths } from "../lib/draft";
import { BidBuilder } from "./bid-builder";

export const dynamic = "force-dynamic";

export default async function Home() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  let airlines: AirlineOption[] | null = null;
  try {
    const res = await fetch(`${apiUrl}/airlines`, { cache: "no-store" });
    if (res.ok) airlines = (await res.json()) as AirlineOption[];
  } catch {
    // API down: render the error state below
  }

  return (
    <main className="page">
      <div className="hero">
        <p className="eyebrow">Monthly bidding</p>
        <h1>Build next month&apos;s bid without learning PBS</h1>
        <p className="lede">
          Pick the days you want off, rank what matters most, and Holdline writes your bid lines in
          order with the clicks for each one. You type them in yourself. Holdline never signs in to
          your airline.
        </p>
      </div>
      {airlines ? (
        <BidBuilder airlines={airlines} apiUrl={apiUrl} months={bidMonths(new Date())} />
      ) : (
        <div className="notice notice-danger" role="alert">
          <p className="notice-title">Can&apos;t reach the Holdline API</p>
          <p>Tried {apiUrl}. Start it with pnpm dev, or set NEXT_PUBLIC_API_URL in .env.</p>
        </div>
      )}
    </main>
  );
}
