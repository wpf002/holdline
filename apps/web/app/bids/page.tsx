import { SavedBids } from "./saved-bids";

export const metadata = { title: "My bids · Holdline" };

export default function BidsPage() {
  return (
    <main className="page">
      <div className="hero">
        <p className="eyebrow">Account</p>
        <h1>My bids</h1>
        <p className="lede">
          Saved bids, newest first. The default bid is the one the form starts from each month.
        </p>
      </div>
      <SavedBids apiUrl={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"} />
    </main>
  );
}
