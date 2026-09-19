import { bidMonths } from "../lib/draft";
import type { AirlineOption } from "../lib/api";
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
      <header className="masthead">
        <h1>Holdline</h1>
        <p className="lede">
          Say what you want from next month&apos;s schedule. Holdline writes your PBS bid in the
          order PBS reads it, with the clicks to enter each line.
        </p>
      </header>
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
