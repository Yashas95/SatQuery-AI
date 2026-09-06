/**
 * Thin fetch wrapper for the SatQuery backend.
 *
 * Deliberately not a data-fetching library: the app has a handful of
 * endpoints and one genuinely stateful flow (query submission), so the
 * cost of a client cache layer isn't earned. What this does provide is
 * the three things hand-rolled fetch calls usually get wrong — a typed
 * error with the server's `detail` attached, an abort signal on every
 * request, and one place that knows the base URL.
 */

/** Trailing slash stripped so `${BASE}/assets/` never doubles up. */
export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

export const API_PREFIX = "/api/v1";

export class ApiError extends Error {
  readonly status: number;
  /** FastAPI puts human-readable failures in `detail`. */
  readonly detail: string | undefined;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }

  /** True for the errors worth retrying rather than surfacing. */
  get isTransient(): boolean {
    return this.status === 0 || this.status === 503 || this.status >= 500;
  }
}

/**
 * FastAPI's `detail` is a string for `HTTPException` but a list of
 * validation objects for 422s. Flatten both into one line.
 */
function readDetail(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (typeof d === "string") return d;
        const { loc, msg } = (d ?? {}) as { loc?: unknown[]; msg?: string };
        const where = Array.isArray(loc) ? loc.join(".") : undefined;
        return where ? `${where}: ${msg ?? "invalid"}` : (msg ?? "invalid");
      })
      .join("; ");
  }
  return undefined;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  /** JSON-serialised automatically. Use `formData` for uploads. */
  json?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

export async function apiFetch<T>(
  path: string,
  { json, formData, headers, ...init }: RequestOptions = {},
): Promise<T> {
  const url = `${API_BASE}${API_PREFIX}${path}`;

  const requestHeaders = new Headers(headers);
  let body: BodyInit | undefined;

  if (formData) {
    // Let the browser set the multipart boundary — setting Content-Type
    // by hand here is the classic cause of a silent 422 on upload.
    body = formData;
  } else if (json !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: requestHeaders, body });
  } catch (cause) {
    // Network-level failure: the API isn't running, CORS rejected the
    // preflight, or the request was aborted.
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(
      0,
      `Cannot reach the SatQuery API at ${API_BASE}.`,
      "Check that the FastAPI server is running and that this origin is listed in ALLOWED_ORIGINS.",
    );
  }

  if (response.status === 204) return undefined as T;

  const raw = await response.text();
  const parsed = raw ? safeJsonParse(raw) : undefined;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `${response.status} ${response.statusText}`,
      readDetail(parsed) ?? (raw.length < 300 ? raw : undefined),
    );
  }

  return parsed as T;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * WebSocket URL for a session's live agent trace.
 * Mirrors the HTTP scheme so this works unchanged behind TLS.
 */
export function traceSocketUrl(sessionId: string): string {
  const base = API_BASE.replace(/^http/, "ws");
  return `${base}${API_PREFIX}/sessions/${sessionId}/ws`;
}

/**
 * Export URIs come back as server-local paths (`/data/reports/x.json`).
 * Resolve against the API origin so a link is clickable from the browser.
 */
export function resolveExportUri(uri: string): string {
  return uri.startsWith("http") ? uri : `${API_BASE}${uri}`;
}
