/**
 * Wire types for the SatQuery FastAPI backend.
 *
 * These mirror `app/schemas/*.py` field-for-field. When a schema changes on
 * the Python side, change it here in the same commit — the frontend treats
 * this file as the contract, and every fetch in `lib/api` is typed through
 * it rather than through `any`.
 *
 * Two deliberate divergences from the current routers, both noted inline:
 * some routers pass fields the schema does not declare (Pydantic drops them
 * before they reach the wire), so those fields are typed optional here and
 * the UI degrades rather than assuming they arrive.
 */

// ── Assets (app/schemas/assets.py) ────────────────────────────────────────────

export type ImageModality =
  | "optical"
  | "sar"
  | "multispectral"
  | "hyperspectral"
  | "unknown";

/** `[minx, miny, maxx, maxy]`, in the units of the asset's own CRS. */
export type BBox = [number, number, number, number];

export interface AssetMetadata {
  asset_id: string;
  filename: string;
  modality: ImageModality;
  crs: string | null;
  bbox: BBox | null;
  acquisition_time: string | null;
  width: number | null;
  height: number | null;
  band_count: number | null;
  storage_path: string;
  created_at: string;
}

export interface AssetUploadResponse extends Omit<AssetMetadata, "created_at"> {
  file_size_bytes: number;
  message: string;
}

export interface AssetListResponse {
  assets: AssetMetadata[];
  total: number;
}

// ── Sessions & queries (app/schemas/sessions.py) ──────────────────────────────

export type SessionState = "active" | "idle" | "closed";

export interface SessionCreateResponse {
  session_id: string;
  user_id: string | null;
  state: SessionState;
  created_at: string;
  message: string;
}

export interface SessionInfoResponse {
  session_id: string;
  state: SessionState;
  created_at: string;
  query_count: number;
  referenced_asset_ids: string[];
}

export interface QueryRequest {
  text: string;
  asset_ids: string[];
  /** Required in the body as well as the path — see `submit_query`. */
  session_id: string;
}

export interface QuerySubmitResponse {
  query_id: string;
  session_id: string;
  status: string;
  message: string;
}

export type QueryStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  // The worker writes these strings directly; keep the union open so an
  // unrecognised status renders as "unknown" instead of crashing a switch.
  | (string & {});

export interface QueryStatusResponse {
  query_id: string;
  session_id: string;
  status: QueryStatus;
  /** `{ run_id }` once the worker has stored the run. */
  result: { run_id?: string } | null;
  trace: TraceStep[] | null;
  error: string | null;
  /**
   * NOTE: `submit_query`'s handler passes `text`/`asset_ids`/`created_at`, but
   * `QueryStatusResponse` doesn't declare them, so Pydantic drops them before
   * serialising. Typed optional so the UI keeps its own copy of the prompt
   * instead of relying on the echo.
   */
  text?: string;
  asset_ids?: string[];
  created_at?: string;
}

// ── Workflows (app/schemas/workflows.py) ──────────────────────────────────────

export type WorkflowType =
  | "vqa"
  | "captioning"
  | "grounding"
  | "change_detection"
  | "sar_fusion";

export interface BoundingBox {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  crs: string | null;
}

export interface Finding {
  finding_id: string;
  workflow: WorkflowType;
  label: string | null;
  answer: string | null;
  /** 0..1, enforced by the backend schema. */
  confidence: number;
  bounding_boxes: BoundingBox[] | null;
  change_classes: string[] | null;
  evidence_refs: string[];
  metadata: Record<string, unknown> | null;
}

export interface WorkflowResult {
  run_id: string;
  query_id: string;
  workflow: WorkflowType;
  status: string;
  findings: Finding[];
  trace: TraceStep[];
  error: string | null;
  duration_ms: number | null;
}

// ── Reports (app/schemas/reports.py) ──────────────────────────────────────────

export interface Report {
  report_id: string;
  run_id: string;
  session_id: string;
  summary: string;
  evidence: Record<string, unknown>[];
  export_uri: string | null;
  created_at: string;
}

export interface ReportListResponse {
  reports: Report[];
  total: number;
}

export type ExportFormat = "json" | "pdf" | "geojson";

export interface ExportResponse {
  report_id: string;
  format: ExportFormat;
  export_uri: string;
  message: string;
}

// ── Agent trace ───────────────────────────────────────────────────────────────

/**
 * Trace entries are `list[dict]` on the backend — the orchestrator and the
 * worker each write their own shapes. `step` is the one key every writer
 * sets (see `query_worker.py`), so it's the only field typed as required.
 */
export interface TraceStep {
  step: string;
  query_id?: string;
  run_id?: string;
  error?: string;
  result?: unknown;
  confidence?: number;
  [key: string]: unknown;
}
