"use client";

/**
 * Result readout for a completed run: what the system concluded, how sure it
 * is, and what that conclusion is traceable to.
 *
 * Deliberately does NOT compute a ground area from the asset bbox. Doing so
 * correctly needs the CRS's units, and a bbox in EPSG:4326 is in degrees —
 * multiplying those gives a number that looks like km² and isn't. An absent
 * field is recoverable; a confidently wrong measurement in an evidence panel
 * is the exact failure mode this product exists to avoid.
 */

import { useRouter } from "next/navigation";

import type { AnalysisPhase } from "@/hooks/useAnalysisSession";
import type { AssetMetadata, Finding, WorkflowResult } from "@/lib/api/types";
import { Button, DataRow, EmptyState, Pill, cx } from "./primitives";

const WORKFLOW_LABEL: Record<string, string> = {
  vqa: "Visual question answering",
  captioning: "Scene captioning",
  grounding: "Object grounding",
  change_detection: "Change detection",
  sar_fusion: "Optical–SAR fusion",
};

function confidenceTone(value: number) {
  if (value >= 0.75) return "ok" as const;
  if (value >= 0.4) return "warn" as const;
  return "error" as const;
}

export default function FindingsPanel({
  phase,
  result,
  findings,
  asset,
  error,
  activeFindingId,
  onSelectFinding,
}: {
  phase: AnalysisPhase;
  result: WorkflowResult | null;
  findings: Finding[];
  asset: AssetMetadata | null;
  error: string | null;
  activeFindingId: string | null;
  onSelectFinding: (findingId: string) => void;
}) {
  const router = useRouter();

  if (phase === "idle") {
    return (
      <EmptyState
        title="No analysis yet"
        hint="Pick an image and ask a question. The result, its confidence, and the evidence behind it appear here."
      />
    );
  }

  if (phase === "connecting" || phase === "queued" || phase === "processing") {
    return (
      <div className="space-y-3">
        <Pill tone="active">
          {phase === "queued" ? "Queued for the worker" : "Analysing"}
        </Pill>
        <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
          The orchestrator is planning the analysis and routing it to a
          specialist workflow. Steps appear in Agent Activity as they run.
        </p>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="space-y-3">
        <Pill tone="error">Run failed</Pill>
        <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
          {error ?? "The analysis pipeline reported a failure."}
        </p>
      </div>
    );
  }

  // Completed — but possibly with nothing to show, which is a real outcome
  // (the confidence gate withholds low-certainty results by design).
  const primary = findings[0] ?? null;
  const headline =
    primary?.answer ??
    primary?.label ??
    (result?.error ? "Result withheld" : "No findings returned");

  const boxCount = findings.reduce(
    (total, finding) => total + (finding.bounding_boxes?.length ?? 0),
    0,
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-[family-name:var(--font-serif-display)] text-lg leading-snug text-[var(--ink-primary)]">
            {headline}
          </h3>
          {boxCount > 0 ? (
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {boxCount} region{boxCount === 1 ? "" : "s"} localised across{" "}
              {findings.length} finding{findings.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        {result?.error ? (
          <Pill tone="warn">Withheld</Pill>
        ) : (
          <Pill tone="ok">Complete</Pill>
        )}
      </div>

      {result?.error ? (
        <p className="rounded-md border border-[color-mix(in_srgb,var(--state-warn)_35%,transparent)] bg-[color-mix(in_srgb,var(--state-warn)_8%,transparent)] px-3 py-2.5 text-sm leading-relaxed text-[var(--state-warn)]">
          {result.error}
        </p>
      ) : null}

      {primary ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            Confidence
          </p>
          <div className="mt-1 flex items-baseline gap-3">
            <span
              className={cx(
                "font-[family-name:var(--font-serif-display)] text-4xl",
                confidenceTone(primary.confidence) === "ok"
                  ? "text-[var(--state-ok)]"
                  : confidenceTone(primary.confidence) === "warn"
                    ? "text-[var(--state-warn)]"
                    : "text-[var(--state-error)]",
              )}
            >
              {(primary.confidence * 100).toFixed(0)}%
            </span>
            {primary.confidence < 0.4 ? (
              <span className="text-xs text-[var(--ink-muted)]">
                below the backend&rsquo;s 0.40 acceptance threshold
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <dl className="divide-y divide-[var(--rule-hairline)] border-y border-[var(--rule-hairline)]">
        <DataRow
          label="Analysis type"
          value={
            result ? (WORKFLOW_LABEL[result.workflow] ?? result.workflow) : "—"
          }
        />
        <DataRow label="Image" value={asset?.filename ?? "—"} />
        <DataRow
          label="Acquisition"
          value={
            asset?.acquisition_time
              ? new Date(asset.acquisition_time).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "Not recorded"
          }
        />
        <DataRow
          label="Dimensions"
          value={
            asset?.width && asset.height
              ? `${asset.width} × ${asset.height} px`
              : "—"
          }
          mono
        />
        <DataRow label="CRS" value={asset?.crs ?? "Not georeferenced"} mono />
        {result?.duration_ms != null ? (
          <DataRow
            label="Duration"
            value={`${(result.duration_ms / 1000).toFixed(1)}s`}
            mono
          />
        ) : null}
        {result ? <DataRow label="Run ID" value={result.run_id} mono /> : null}
      </dl>

      {findings.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            Detections
          </p>
          <ul className="space-y-1.5">
            {findings.map((finding, index) => (
              <li key={finding.finding_id}>
                <button
                  type="button"
                  onClick={() => onSelectFinding(finding.finding_id)}
                  className={cx(
                    "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                    finding.finding_id === activeFindingId
                      ? "border-[var(--brand-rule)] bg-[var(--brand-rule-soft)]"
                      : "border-[var(--rule-hairline)] hover:border-[var(--rule-strong)]",
                  )}
                >
                  <span className="min-w-0 truncate text-sm text-[var(--ink-primary)]">
                    {finding.label ?? finding.answer ?? `Finding ${index + 1}`}
                  </span>
                  <span className="shrink-0 font-[family-name:var(--font-geist-mono)] text-xs text-[var(--ink-muted)]">
                    {(finding.confidence * 100).toFixed(0)}%
                  </span>
                </button>

                {finding.change_classes?.length ? (
                  <p className="mt-1 pl-3 text-xs text-[var(--ink-muted)]">
                    {finding.change_classes.join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {primary?.evidence_refs.length ? (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            Evidence
          </p>
          <ul className="space-y-1">
            {primary.evidence_refs.map((ref) => (
              <li
                key={ref}
                className="truncate font-[family-name:var(--font-geist-mono)] text-[11px] text-[var(--ink-muted)]"
              >
                {ref}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result ? (
        <Button
          variant="secondary"
          className="w-full"
          // Export goes through the reports router, which is keyed by
          // report_id — not run_id — so this hands off to Reports rather
          // than pretending a direct download exists here.
          onClick={() => router.push("/reports")}
        >
          View in Reports
        </Button>
      ) : null}
    </div>
  );
}
