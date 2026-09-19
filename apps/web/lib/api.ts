import type {
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
    case "no_pairings":
      return `No pairings could be read from that file. ${(body.errors ?? [])
        .slice(0, 3)
        .map((e) => (e.line ? `Line ${e.line}: ${e.message}` : e.message))
        .join(" ")}`;
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

async function post<T>(apiUrl: string, path: string, body: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: `Can't reach the Holdline API at ${apiUrl}.` };
  }
  const json: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, data: json as T };
  return { ok: false, message: describeError(res.status, json as ErrorBody | null) };
}

export const compileBid = (apiUrl: string, intent: BidIntent) =>
  post<CompileResponse>(apiUrl, "/bids/compile", intent);

export const importPairings = (apiUrl: string, request: ImportRequest) =>
  post<ImportResponse>(apiUrl, "/bid-periods/import", request);

export const parseDescription = (apiUrl: string, request: ParseRequest) =>
  post<ParseResponse>(apiUrl, "/bids/parse", request);
