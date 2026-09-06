/**
 * One function per backend route, grouped by router. Every call goes
 * through `apiFetch`, so callers get `ApiError` on failure and a typed
 * body on success.
 */

import { apiFetch } from "./client";
import type {
  AssetListResponse,
  AssetMetadata,
  AssetUploadResponse,
  ExportFormat,
  ExportResponse,
  QueryStatusResponse,
  QuerySubmitResponse,
  ReportListResponse,
  Report,
  SessionCreateResponse,
  SessionInfoResponse,
  WorkflowResult,
} from "./types";

// ── Assets ────────────────────────────────────────────────────────────────────

export const assets = {
  list(
    { skip = 0, limit = 20 }: { skip?: number; limit?: number } = {},
    signal?: AbortSignal,
  ) {
    // Note the trailing slash: `list_assets` is registered at "/" under the
    // /assets prefix, and FastAPI 307-redirects without it — which drops
    // the CORS headers on some browsers.
    return apiFetch<AssetListResponse>(
      `/assets/?skip=${skip}&limit=${limit}`,
      { signal },
    );
  },

  get(assetId: string, signal?: AbortSignal) {
    return apiFetch<AssetMetadata>(`/assets/${assetId}`, { signal });
  },

  upload(file: File, signal?: AbortSignal) {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch<AssetUploadResponse>("/assets/upload", {
      method: "POST",
      formData,
      signal,
    });
  },

  remove(assetId: string) {
    return apiFetch<void>(`/assets/${assetId}`, { method: "DELETE" });
  },
};

// ── Sessions & queries ────────────────────────────────────────────────────────

export const sessions = {
  create(signal?: AbortSignal) {
    return apiFetch<SessionCreateResponse>("/sessions/", {
      method: "POST",
      signal,
    });
  },

  get(sessionId: string, signal?: AbortSignal) {
    return apiFetch<SessionInfoResponse>(`/sessions/${sessionId}`, { signal });
  },

  close(sessionId: string) {
    return apiFetch<void>(`/sessions/${sessionId}`, { method: "DELETE" });
  },

  submitQuery(
    sessionId: string,
    text: string,
    assetIds: string[],
    signal?: AbortSignal,
  ) {
    return apiFetch<QuerySubmitResponse>(`/sessions/${sessionId}/queries`, {
      method: "POST",
      // `session_id` is required in the body as well as the path.
      json: { text, asset_ids: assetIds, session_id: sessionId },
      signal,
    });
  },

  queryStatus(sessionId: string, queryId: string, signal?: AbortSignal) {
    return apiFetch<QueryStatusResponse>(
      `/sessions/${sessionId}/queries/${queryId}/status`,
      { signal },
    );
  },
};

// ── Workflows ─────────────────────────────────────────────────────────────────

export const workflows = {
  get(runId: string, signal?: AbortSignal) {
    return apiFetch<WorkflowResult>(`/workflows/${runId}`, { signal });
  },

  listForQuery(queryId: string, signal?: AbortSignal) {
    return apiFetch<WorkflowResult[]>(`/workflows/query/${queryId}`, { signal });
  },
};

// ── Reports ───────────────────────────────────────────────────────────────────

export const reports = {
  get(reportId: string, signal?: AbortSignal) {
    return apiFetch<Report>(`/reports/${reportId}`, { signal });
  },

  listForSession(sessionId: string, signal?: AbortSignal) {
    return apiFetch<ReportListResponse>(`/reports/session/${sessionId}`, {
      signal,
    });
  },

  export(reportId: string, format: ExportFormat) {
    return apiFetch<ExportResponse>("/reports/export", {
      method: "POST",
      json: { report_id: reportId, format },
    });
  },
};

// ── Health ────────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  version: string;
  env: string;
  db: boolean;
  redis: boolean;
}

/** `/health` sits outside the /api/v1 prefix, so it bypasses `apiFetch`. */
export async function checkHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const { API_BASE } = await import("./client");
  const response = await fetch(`${API_BASE}/health`, { signal });
  if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
  return response.json();
}
