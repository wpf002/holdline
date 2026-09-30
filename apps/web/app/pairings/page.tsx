import Link from "next/link";
import type { AirlineOption } from "../../lib/api";
import { bidMonths } from "../../lib/draft";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bid Package · Holdline" };

export default async function PairingsPage() {
  const today = new Date();
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
        <p className="eyebrow">Pool preview</p>
        <h1>Import Your Bid Package</h1>
        <p className="lede">
          Load a month&apos;s pairings for your base. Then <Link href="/">build your bid</Link> to
          see how many pairings each line removes.
        </p>
      </div>
      {airlines ? (
        <ImportForm
          airlines={airlines}
          apiUrl={apiUrl}
          months={bidMonths(today, 9, -6)}
          defaultMonth={bidMonths(today, 1, 1)[0]!}
          lastMonth={bidMonths(today, 1, -1)[0]!}
        />
      ) : (
        <div className="notice notice-danger" role="alert">
          <p className="notice-title">Can&apos;t reach the Holdline API</p>
          <p>Tried {apiUrl}. Start it with pnpm dev, or set NEXT_PUBLIC_API_URL in .env.</p>
        </div>
      )}
    </main>
  );
}
