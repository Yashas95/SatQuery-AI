"use client";

/**
 * The orchestrator's execution trace, streamed live where possible.
 *
 * This is the product's transparency claim made visible — the PRD's whole
 * "ASK → ANALYZE → VISUALIZE → VERIFY" promise is only credible if the user
 * can watch the middle two happen. So the panel distinguishes a genuinely
 * live socket from a polled reconstruction rather than implying real-time
 * either way.
 */

import { useEffect, useRef } from "react";

import type { AnalysisPhase } from "@/hooks/useAnalysisSession";
import type { TraceStep } from "@/lib/api/types";
import { cx, Pill } from "./primitives";

/**
 * Steps the backend emits by name (see `query_worker.py` and the graceful
 * failure handlers in `routers/workflows.py`). Anything not listed falls
 * back to a de-snaked version of the raw key, so a new orchestrator node
 * shows up readably the day it's added rather than as a blank row.
 */
const STEP_LABELS: Record<string, string> = {
  worker_started: "Worker picked up the query",
  worker_completed: "Workflow completed",
  worker_failed: "Worker failed",
  modality_check: "Checked image modality",
  confidence_check: "Validated result confidence",
  plan: "Planned the analysis",
  route: "Selected specialist workflow",
};

function humanise(step: string): string {
  return (
    STEP_LABELS[step] ??
    step.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

function stepTone(step: TraceStep): "neutral" | "error" | "warn" {
  if (step.step.includes("failed") || step.error) return "error";
  if (step.step === "confidence_check" || step.result === "unsupported") {
    return "warn";
  }
  return "neutral";
}

export default function AgentActivity({
  trace,
  phase,
  liveTrace,
}: {
  trace: TraceStep[];
  phase: AnalysisPhase;
  liveTrace: boolean;
}) {
  const scrollerRef = useRef<HTMLOListElement>(null);

  // Follow the tail as steps arrive, but only while the run is active —
  // yanking the scroll position after it finishes fights the user reading it.
  useEffect(() => {
    if (phase === "completed" || phase === "failed") return;
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [trace.length, phase]);

  const isRunning =
    phase === "connecting" || phase === "queued" || phase === "processing";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-primary)]">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-[var(--brand-rule)]" fill="none">
            <path
              d="M3 12h3l2.5-6 3 12 2.5-8 2 4h5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Agent Activity
        </h3>

        {isRunning ? (
          liveTrace ? (
            <Pill tone="ok">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              Streaming
            </Pill>
          ) : (
            // Honest about the downgrade: the run is still tracked, just
            // reconstructed from status polls instead of pushed.
            <Pill tone="warn">Polling — trace socket unavailable</Pill>
          )
        ) : null}
      </div>

      {trace.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--rule-strong)] px-3 py-6 text-center text-sm text-[var(--ink-muted)]">
          {isRunning
            ? "Waiting for the orchestrator to report its first step…"
            : "Run a query to see how the analysis was planned and executed."}
        </p>
      ) : (
        <ol
          ref={scrollerRef}
          className="max-h-64 space-y-0 overflow-y-auto pr-1"
        >
          {trace.map((step, index) => {
            const tone = stepTone(step);
            const isLast = index === trace.length - 1;
            return (
              <li key={`${step.step}-${index}`} className="flex gap-3">
                {/* Rail: dot per step, connector between them. */}
                <div className="flex flex-col items-center">
                  <span
                    className={cx(
                      "mt-2 h-2 w-2 shrink-0 rounded-full",
                      tone === "error"
                        ? "bg-[var(--state-error)]"
                        : tone === "warn"
                          ? "bg-[var(--state-warn)]"
                          : "bg-[var(--brand-deep)]",
                      isLast && isRunning && "animate-pulse",
                    )}
                  />
                  {!isLast ? (
                    <span className="w-px flex-1 bg-[var(--rule-hairline)]" />
                  ) : null}
                </div>

                <div className={cx("min-w-0 flex-1", !isLast && "pb-3")}>
                  <p className="text-sm text-[var(--ink-primary)]">
                    {humanise(step.step)}
                  </p>
                  <StepDetail step={step} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/**
 * Trace entries are untyped dicts on the backend, so render the handful of
 * keys that carry meaning and drop the plumbing (`step`, ids) rather than
 * dumping raw JSON at the user.
 */
function StepDetail({ step }: { step: TraceStep }) {
  const parts: string[] = [];

  if (typeof step.confidence === "number") {
    parts.push(`confidence ${(step.confidence * 100).toFixed(0)}%`);
  }
  if (typeof step.result === "string") parts.push(step.result);
  if (typeof step.modality === "string") parts.push(`modality ${step.modality}`);

  if (step.error) {
    return (
      <p className="mt-0.5 text-xs leading-relaxed text-[var(--state-error)]">
        {String(step.error)}
      </p>
    );
  }

  if (parts.length === 0) return null;

  return (
    <p className="mt-0.5 font-[family-name:var(--font-geist-mono)] text-[11px] text-[var(--ink-faint)]">
      {parts.join(" · ")}
    </p>
  );
}
