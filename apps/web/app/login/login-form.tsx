"use client";

import { useId, useState } from "react";
import { requestSignInLink } from "../../lib/api";
import { Section } from "../section";

export function LoginForm({ apiUrl }: { apiUrl: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await requestSignInLink(apiUrl, email);
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setSentTo(email.trim().toLowerCase());
  }

  if (sentTo) {
    return (
      <div className="stack narrow">
        <div className="notice" role="status">
          <p className="notice-title">Check your email</p>
          <p>
            We sent a sign-in link to <span className="mono">{sentTo}</span>. It works once, for 15
            minutes.
          </p>
          <p className="hint">Running Holdline locally? The link is printed in the API console.</p>
        </div>
      </div>
    );
  }

  return (
    <form className="stack narrow" onSubmit={submit}>
      <Section id="login-title" title="Email">
        <div className="field">
          <label className="label" htmlFor={id}>
            Email address
          </label>
          <input
            id={id}
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="actions">
          <button type="submit" className="button button-primary" disabled={busy} aria-busy={busy}>
            {busy ? "Sending…" : "Email me a link"}
          </button>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </div>
      </Section>
    </form>
  );
}
