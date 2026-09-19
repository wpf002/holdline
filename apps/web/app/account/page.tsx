import type { AirlineOption } from "../../lib/api";
import { AccountPanel } from "./account-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account · Holdline" };

export default async function AccountPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  let airlines: AirlineOption[] = [];
  try {
    const res = await fetch(`${apiUrl}/airlines`, { cache: "no-store" });
    if (res.ok) airlines = (await res.json()) as AirlineOption[];
  } catch {
    // The panel shows its own error when the API is down.
  }
  return (
    <main className="page">
      <div className="hero">
        <p className="eyebrow">Account</p>
        <h1>Your defaults and subscription</h1>
      </div>
      <AccountPanel apiUrl={apiUrl} airlines={airlines} />
    </main>
  );
}
