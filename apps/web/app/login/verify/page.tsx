import { Suspense } from "react";
import { VerifyLink } from "./verify-link";

export const metadata = { title: "Signing in · Holdline" };

export default function VerifyPage() {
  return (
    <main className="page">
      <div className="hero">
        <p className="eyebrow">Account</p>
        <h1>Signing in</h1>
      </div>
      <Suspense fallback={<p className="hint">Checking your link…</p>}>
        <VerifyLink apiUrl={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"} />
      </Suspense>
    </main>
  );
}
