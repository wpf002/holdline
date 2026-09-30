import { LoginForm } from "./login-form";

export const metadata = { title: "Sign In · Holdline" };

export default function LoginPage() {
  return (
    <main className="page">
      <div className="hero">
        <p className="eyebrow">Account</p>
        <h1>Sign In</h1>
        <p className="lede">
          Holdline emails you a link. No password. Signing in lets you save bids and keep a default
          bid to start from each month.
        </p>
      </div>
      <LoginForm apiUrl={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"} />
    </main>
  );
}
