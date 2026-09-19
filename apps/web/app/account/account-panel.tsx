"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import {
  openBillingPortal,
  signOut,
  startCheckout,
  updateProfile,
  type AccountInfo,
  type AirlineOption,
} from "../../lib/api";
import { useAccount } from "../../lib/use-account";
import { Section } from "../section";
import { Segmented } from "../segmented";

type Crew = NonNullable<AccountInfo["crewGroup"]>;
const ACTIVE = new Set(["active", "trialing"]);

export function AccountPanel({ apiUrl, airlines }: { apiUrl: string; airlines: AirlineOption[] }) {
  const { account, loading } = useAccount(apiUrl);
  if (loading) return <p className="hint">Loading your account…</p>;
  if (!account) {
    return (
      <div className="notice narrow">
        <p className="notice-title">You&apos;re not signed in</p>
        <p>
          <Link href="/login">Sign in</Link> to save bids and keep your defaults.
        </p>
      </div>
    );
  }
  return <SignedIn apiUrl={apiUrl} airlines={airlines} initial={account} />;
}

function SignedIn({
  apiUrl,
  airlines,
  initial,
}: {
  apiUrl: string;
  airlines: AirlineOption[];
  initial: AccountInfo;
}) {
  const ids = { airline: useId(), base: useId(), seniority: useId() };
  const [account, setAccount] = useState(initial);
  const [airline, setAirline] = useState(initial.airline ?? "");
  const [crewGroup, setCrewGroup] = useState<Crew>(initial.crewGroup ?? "PILOT");
  const [base, setBase] = useState(initial.base ?? "");
  const [seniority, setSeniority] = useState(initial.seniority ? String(initial.seniority) : "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [returned, setReturned] = useState(false);

  useEffect(() => {
    setReturned(new URLSearchParams(window.location.search).get("billing") === "done");
  }, []);

  async function save() {
    if (base && !/^[A-Za-z]{3}$/.test(base)) {
      return setMessage({ text: "Enter your base as a 3-letter code.", error: true });
    }
    setSaving(true);
    const res = await updateProfile(apiUrl, {
      airline: airline || null,
      crewGroup,
      base: base ? base.toUpperCase() : null,
      seniority: seniority ? Number(seniority) : null,
    });
    setSaving(false);
    if (!res.ok) return setMessage({ text: res.message, error: true });
    setAccount(res.data.account);
    setMessage({ text: "Saved. New bids start from these." });
  }

  async function billing(action: "checkout" | "portal") {
    setBillingBusy(true);
    setBillingError(null);
    const res =
      action === "checkout" ? await startCheckout(apiUrl) : await openBillingPortal(apiUrl);
    if (!res.ok) {
      setBillingBusy(false);
      return setBillingError(res.message);
    }
    window.location.assign(res.data.url);
  }

  async function leave() {
    await signOut(apiUrl);
    window.location.assign("/");
  }

  const active = account.subscriptionStatus !== null && ACTIVE.has(account.subscriptionStatus);
  const until = account.currentPeriodEnd
    ? new Date(account.currentPeriodEnd).toLocaleDateString()
    : null;

  return (
    <div className="stack narrow">
      <Section
        id="defaults-title"
        step="01"
        title="Bid defaults"
        hint="The bid form starts from these. Seniority is only used for hold estimates."
      >
        <div className="row">
          <div className="field">
            <label className="label" htmlFor={ids.airline}>
              Airline
            </label>
            <select
              id={ids.airline}
              className="select"
              value={airline}
              onChange={(e) => setAirline(e.target.value)}
            >
              <option value="">None</option>
              {airlines.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name} ({a.code})
                </option>
              ))}
            </select>
          </div>
          <Segmented
            label="Crew"
            value={crewGroup}
            options={[
              { value: "PILOT", label: "Pilot" },
              { value: "FLIGHT_ATTENDANT", label: "Flight attendant" },
            ]}
            onChange={setCrewGroup}
          />
        </div>
        <div className="row">
          <div className="field">
            <label className="label" htmlFor={ids.base}>
              Base
            </label>
            <input
              id={ids.base}
              className="input input-code"
              value={base}
              maxLength={3}
              placeholder="DFW"
              autoComplete="off"
              onChange={(e) => setBase(e.target.value.toUpperCase())}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor={ids.seniority}>
              Seniority
            </label>
            <input
              id={ids.seniority}
              className="input input-narrow mono"
              inputMode="numeric"
              value={seniority}
              placeholder="Optional"
              autoComplete="off"
              onChange={(e) => setSeniority(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
        <div className="actions">
          <button
            type="button"
            className="button"
            onClick={save}
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? "Saving…" : "Save defaults"}
          </button>
          {message && (
            <p className={message.error ? "error-text" : "hint"} role="status">
              {message.text}
            </p>
          )}
        </div>
      </Section>

      <Section id="plan-title" step="02" title="Subscription">
        {returned && !active && (
          <p className="hint" role="status">
            Thanks. Your subscription shows here once Stripe confirms it, usually within a minute.
          </p>
        )}
        <p>
          {active
            ? `Active${until ? ` through ${until}` : ""}.`
            : account.subscriptionStatus
              ? `Status: ${account.subscriptionStatus.replace(/_/g, " ")}.`
              : "No subscription."}
        </p>
        <div className="actions">
          {account.subscriptionStatus ? (
            <button
              type="button"
              className="button"
              onClick={() => billing("portal")}
              disabled={billingBusy}
              aria-busy={billingBusy}
            >
              Manage billing
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              onClick={() => billing("checkout")}
              disabled={billingBusy}
              aria-busy={billingBusy}
            >
              Subscribe
            </button>
          )}
          {billingError && (
            <p className="error-text" role="alert">
              {billingError}
            </p>
          )}
        </div>
      </Section>

      <Section id="session-title" step="03" title="Signed in">
        <p>
          <span className="mono">{account.email}</span>
        </p>
        <div className="actions">
          <button type="button" className="button" onClick={leave}>
            Sign out
          </button>
        </div>
      </Section>
    </div>
  );
}
