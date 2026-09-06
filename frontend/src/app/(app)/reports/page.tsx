"use client";

/**
 * Reports — the record of what has been analysed in this session.
 *
 * The backend scopes reports by session (`GET /reports/session/{id}`), and
 * the session id lives in sessionStorage, so this list is per-browser-tab
 * and does not survive closing it. That's a backend-shaped limitation, not
 * a UI choice, so the page states it rather than letting a user think their
 * history was lost.
 *
 * Reads the session id directly instead of calling `useAnalysisSession` —
 * this screen has no queries to run, and that hook would open a trace
 * WebSocket for nothing.
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError, resolveExportUri } from "@/lib/api/client";
import { reports as reportsApi } from "@/lib/api/endpoints";
import {
  Button,
  EmptyState,
  ErrorNotice,
  Eyebrow,
  Panel,
  Pill,
  Shimmer,
  cx,
} from "@/components/app/primitives";
import type { ExportFormat, Report } from "@/lib/api/types";

const FORMATS: ExportFormat[] = ["json", "geojson", "pdf"];

export default function ReportsPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    // The sessionStorage read lives inside the async body along with the
    // fetch it feeds: it's the first step of loading, not a separate
    // render-time concern, and keeping it here avoids a synchronous
    // setState in the effect body.
    (async () => {
      const stored = window.sessionStorage.getItem("satquery:session_id");
      setSessionId(stored);
      if (!stored) {
        setIsLoading(false);
        return;
      }

      try {
        const page = await reportsApi.listForSession(stored, controller.signal);
        setItems(page.reports);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof ApiError
            ? (err.detail ?? err.message)
            : "Could not load reports.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Eyebrow>Analysis record</Eyebrow>
        <h1 className="font-[family-name:var(--font-serif-display)] text-[2rem] leading-tight text-[var(--ink-primary)]">
          Reports
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)]">
          Structured summaries written by the report agent at the end of each
          run, with the evidence chain that produced them.
        </p>
      </div>

      {error ? <ErrorNotice>{error}</ErrorNotice> : null}

      {isLoading ? (
        <div className="space-y-3">
          <Shimmer className="h-32" />
          <Shimmer className="h-32" />
        </div>
      ) : !sessionId ? (
        <EmptyState
          title="No session yet"
          hint="Reports are scoped to an analysis session. Run a query from the Analyze workspace and it will appear here."
        />
      ) : items.length === 0 && !error ? (
        <EmptyState
          title="No reports in this session"
          hint="A report is written when a run completes and the report agent produces a summary. Runs that fail validation don't generate one."
        />
      ) : (
        <ul className="space-y-4">
          {items.map((report) => (
            <li key={report.report_id}>
              <ReportCard report={report} />
            </li>
          ))}
        </ul>
      )}

      {sessionId ? (
        <p className="text-xs leading-relaxed text-[var(--ink-faint)]">
          Session {sessionId.slice(0, 8)}… — reports are scoped to this browser
          tab and are not restored after it closes.
        </p>
      ) : null}
    </div>
  );
}

function ReportCard({ report }: { report: Report }) {
  const [exportUri, setExportUri] = useState(report.export_uri);
  const [pending, setPending] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const runExport = useCallback(
    async (format: ExportFormat) => {
      setPending(format);
      setExportError(null);
      try {
        const result = await reportsApi.export(report.report_id, format);
        setExportUri(result.export_uri);
      } catch (err) {
        setExportError(
          err instanceof ApiError
            ? (err.detail ?? err.message)
            : "Export failed.",
        );
      } finally {
        setPending(null);
      }
    },
    [report.report_id],
  );

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-serif-display)] text-lg leading-snug text-[var(--ink-primary)]">
            {report.summary || "Untitled report"}
          </p>
          <p className="mt-1 font-[family-name:var(--font-geist-mono)] text-[11px] text-[var(--ink-faint)]">
            {new Date(report.created_at).toLocaleString()} · run{" "}
            {report.run_id.slice(0, 8)}
          </p>
        </div>
        <Pill tone="ok">Complete</Pill>
      </div>

      {report.evidence.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            Evidence chain · {report.evidence.length} step
            {report.evidence.length === 1 ? "" : "s"}
          </p>
          <ul className="space-y-1.5">
            {report.evidence.slice(0, 4).map((entry, index) => (
              <li
                key={index}
                className="rounded border border-[var(--rule-hairline)] bg-[var(--surface-inset)] px-3 py-2 font-[family-name:var(--font-geist-mono)] text-[11px] leading-relaxed text-[var(--ink-muted)]"
              >
                {summariseEvidence(entry)}
              </li>
            ))}
          </ul>
          {report.evidence.length > 4 ? (
            <p className="mt-1.5 text-xs text-[var(--ink-faint)]">
              +{report.evidence.length - 4} more in the full export
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--rule-hairline)] pt-4">
        <span className="mr-1 text-xs text-[var(--ink-muted)]">Export</span>
        {FORMATS.map((format) => (
          <Button
            key={format}
            variant="secondary"
            className={cx("px-3 py-1.5 text-xs uppercase")}
            disabled={pending !== null}
            onClick={() => void runExport(format)}
          >
            {pending === format ? "…" : format}
          </Button>
        ))}

        {exportUri ? (
          <a
            href={resolveExportUri(exportUri)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-xs font-medium text-[var(--brand-deep)] underline underline-offset-4"
          >
            Open latest export
          </a>
        ) : null}
      </div>

      {exportError ? (
        <p className="mt-2 text-xs text-[var(--state-error)]">{exportError}</p>
      ) : null}
    </Panel>
  );
}

/**
 * Evidence entries are free-form dicts from the report agent. Prefer the
 * keys that read as prose; fall back to compact JSON rather than rendering
 * "[object Object]".
 */
function summariseEvidence(entry: Record<string, unknown>): string {
  for (const key of ["description", "summary", "label", "step", "source"]) {
    const value = entry[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const json = JSON.stringify(entry);
  return json.length > 200 ? `${json.slice(0, 200)}…` : json;
}
