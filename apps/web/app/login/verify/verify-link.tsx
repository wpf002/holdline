"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { verifySignInLink } from "../../../lib/api";

export function VerifyLink({ apiUrl }: { apiUrl: string }) {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<{ email?: string; error?: string } | null>(null);
  // A sign-in link works once; React's development double effects must not spend it twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState({ error: "This page needs the link from your email." });
      return;
    }
    void verifySignInLink(apiUrl, token).then((res) =>
      setState(res.ok ? { email: res.data.account.email } : { error: res.message }),
    );
  }, [apiUrl, token]);

  if (!state) return <p className="hint">Checking your link…</p>;
  if (state.error) {
    return (
      <div className="notice notice-danger narrow" role="alert">
        <p className="notice-title">Couldn&apos;t sign in</p>
        <p>{state.error}</p>
        <p>
          <Link href="/login">Ask for a new link</Link>
        </p>
      </div>
    );
  }
  return (
    <div className="notice narrow" role="status">
      <p className="notice-title">Signed in</p>
      <p>
        You&apos;re signed in as <span className="mono">{state.email}</span>.
      </p>
      <p>
        {/* A full navigation so the header picks up the new session. */}
        <a href="/">Build a bid</a> or <a href="/account">set your defaults</a>.
      </p>
    </div>
  );
}
