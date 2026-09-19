import type {
  AwardImportRequest,
  BidDialect,
  BidIntent,
  CompileResponse,
  ImportRequest,
  ImportResponse,
  ParseRequest,
  ParseResponse,
  PbsVendor,
} from "@holdline/types";

/** How to name a PBS in crew-facing text: "NAVBLUE", "Jeppesen", or "a layered PBS" for American's. */
export function vendorName(vendor: PbsVendor, dialect?: BidDialect): string {
  switch (vendor) {
    case "NAVBLUE":
      return "NAVBLUE";
    case "JEPPESEN":
      return "Jeppesen";
    case "IBS_ADOPT":
      return "IBS / AD OPT";
    case "AOS":
      return "AOS";
    case "UNKNOWN":
      return dialect === "LAYERED" ? "a layered PBS" : "an unnamed PBS";
  }
}

/** One row of GET /airlines. */
export interface AirlineOption {
  code: string;
  name: string;
  deployments: {
    crewGroup: BidIntent["crewGroup"];
    vendor: PbsVendor;
    dialect: BidDialect;
    confidence: "CONFIRMED" | "THIRD_PARTY" | "INFERRED";
    /** Whether Holdline has a compiler for this PBS yet. */
    compilable: boolean;
  }[];
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

type ErrorBody = {
  error?: string;
  reason?: string;
  vendor?: string;
  issues?: { path: (string | number)[]; message: string }[];
  errors?: { line: number; message: string }[];
};

function describeError(status: number, body: ErrorBody | null): string {
  switch (body?.error) {
    case "invalid_intent":
    case "invalid_request": {
      const fields = (body.issues ?? []).map((i) => `${i.path.join(".")}: ${i.message}`);
      return `Some fields need fixing. ${fields.join("; ")}`;
    }
    case "unknown_airline":
    case "no_pbs_deployment":
      return "Holdline has no PBS on file for that airline and crew group.";
    case "not_implemented":
      return `Holdline can't write ${body.vendor ?? "this vendor's"} bids yet.`;
    case "no_awards":
      return `No awards could be read from that file. ${(body.errors ?? [])
        .slice(0, 3)
        .map((e) => (e.line ? `Line ${e.line}: ${e.message}` : e.message))
        .join(" ")}`;
    case "no_pairings":
      return `No pairings could be read from that file. ${(body.errors ?? [])
        .slice(0, 3)
        .map((e) => (e.line ? `Line ${e.line}: ${e.message}` : e.message))
        .join(" ")}`;
    case "sign_in_required":
      return "Sign in first.";
    case "invalid_email":
      return "That doesn't look like an email address.";
    case "too_many_links":
      return "Too many sign-in links for that address in the last hour. Try again later.";
    case "email_not_configured":
      return "Email sign-in isn't switched on for this server yet.";
    case "email_failed":
      return "The sign-in email didn't send. Try again.";
    case "invalid_link":
      return "That sign-in link has expired or was already used. Ask for a new one.";
    case "billing_not_configured":
      return "Subscriptions aren't switched on for this server yet.";
    case "no_subscription":
      return "There's no subscription on this account yet.";
    case "no_default_bid":
    case "not_found":
      return "That bid isn't in your account.";
    case "parser_not_configured":
      return "Plain-English fill isn't switched on for this server. Use the form below.";
    case "parser_failed":
      return body.reason === "invalid_output"
        ? "Holdline couldn't turn that description into form values. Try rewording it, or use the form."
        : "The plain-English reader failed. Try again, or use the form.";
    default:
      return `Request failed (${status}).`;
  }
}

async function request<T>(
  apiUrl: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method,
      // The session is an HttpOnly cookie set by the API.
      credentials: "include",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: `Can't reach the Holdline API at ${apiUrl}.` };
  }
  const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.ok) return { ok: true, data: json as T };
  return { ok: false, message: describeError(res.status, json as ErrorBody | null) };
}

const post = <T>(apiUrl: string, path: string, body: unknown) =>
  request<T>(apiUrl, "POST", path, body);

export const compileBid = (apiUrl: string, intent: BidIntent, seniority?: number) =>
  post<CompileResponse>(apiUrl, "/bids/compile", { ...intent, seniority });

export const importPairings = (apiUrl: string, request: ImportRequest) =>
  post<ImportResponse>(apiUrl, "/bid-periods/import", request);

export const parseDescription = (apiUrl: string, request: ParseRequest) =>
  post<ParseResponse>(apiUrl, "/bids/parse", request);

export const importAwards = (apiUrl: string, request: AwardImportRequest) =>
  post<ImportResponse>(apiUrl, "/awards/import", request);

// ── Account ────────────────────────────────────────────────────────────

export interface AccountInfo {
  id: string;
  email: string;
  airline: string | null;
  crewGroup: BidIntent["crewGroup"] | null;
  base: string | null;
  seniority: number | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
}

export interface SavedBidSummary {
  id: string;
  name: string | null;
  month: string;
  airline: string;
  crewGroup: BidIntent["crewGroup"];
  base: string;
  isDefault: boolean;
  updatedAt: string;
}

export interface SavedBid extends SavedBidSummary {
  intent: BidIntent;
}

export const getAccount = (apiUrl: string) =>
  request<{ account: AccountInfo | null }>(apiUrl, "GET", "/auth/me");
export const requestSignInLink = (apiUrl: string, email: string) =>
  post<{ ok: true }>(apiUrl, "/auth/magic-link", { email });
export const verifySignInLink = (apiUrl: string, token: string) =>
  post<{ account: AccountInfo }>(apiUrl, "/auth/verify", { token });
export const signOut = (apiUrl: string) => post<null>(apiUrl, "/auth/logout", {});
export const updateProfile = (
  apiUrl: string,
  profile: Partial<Pick<AccountInfo, "airline" | "crewGroup" | "base" | "seniority">>,
) => request<{ account: AccountInfo }>(apiUrl, "PATCH", "/me", profile);

export const listBids = (apiUrl: string) =>
  request<{ bids: SavedBidSummary[] }>(apiUrl, "GET", "/bids");
export const getBid = (apiUrl: string, id: string) =>
  request<{ bid: SavedBid }>(apiUrl, "GET", `/bids/${encodeURIComponent(id)}`);
export const getDefaultBid = (apiUrl: string) =>
  request<{ bid: SavedBid }>(apiUrl, "GET", "/bids/default");
export const saveBid = (
  apiUrl: string,
  bid: { intent: BidIntent; name: string | null; isDefault: boolean },
) => post<{ bid: SavedBid }>(apiUrl, "/bids", bid);
export const makeDefaultBid = (apiUrl: string, id: string) =>
  request<{ bid: SavedBid }>(apiUrl, "PATCH", `/bids/${encodeURIComponent(id)}`, {
    isDefault: true,
  });
export const deleteBid = (apiUrl: string, id: string) =>
  request<null>(apiUrl, "DELETE", `/bids/${encodeURIComponent(id)}`);

export const startCheckout = (apiUrl: string) =>
  post<{ url: string }>(apiUrl, "/billing/checkout", {});
export const openBillingPortal = (apiUrl: string) =>
  post<{ url: string }>(apiUrl, "/billing/portal", {});
