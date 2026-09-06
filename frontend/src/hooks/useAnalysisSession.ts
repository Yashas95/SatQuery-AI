"use client";

/**
 * The query lifecycle, which is the one genuinely stateful thing in this app.
 *
 * `POST /sessions/{id}/queries` returns 202 and a `query_id` — the work
 * happens in a Redis-queued worker. So a submitted query has to be followed
 * two ways at once:
 *
 *   1. The WebSocket at `/sessions/{id}/ws` relays orchestrator trace events
 *      as they happen. It's the only way to show the agent thinking, but it
 *      is not authoritative — it can drop, and Redis pub/sub has no replay,
 *      so a socket that connects late misses everything already published.
 *
 *   2. `GET .../status` is authoritative but tells you nothing until the run
 *      lands.
 *
 * So: poll for truth, subscribe for texture. The socket also nudges the
 * poller — when a `worker_completed` event arrives we poll immediately
 * rather than waiting out the interval, which is what makes the UI feel
 * live instead of merely eventually-correct.
 *
 * Terminal state resolves the run's findings from `/workflows/{run_id}`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api/client";
import { traceSocketUrl } from "@/lib/api/client";
import { sessions, workflows } from "@/lib/api/endpoints";
import type {
  Finding,
  QueryStatus,
  TraceStep,
  WorkflowResult,
} from "@/lib/api/types";

/** Poll cadence: tight while the worker is likely mid-flight, then eased off. */
const POLL_SCHEDULE_MS = [400, 400, 700, 700, 1200, 1200, 2000] as const;
const POLL_MAX_MS = 3000;
/** A run that hasn't resolved in this long is reported as stalled, not hung. */
const POLL_TIMEOUT_MS = 120_000;

function pollDelay(attempt: number): number {
  return POLL_SCHEDULE_MS[attempt] ?? POLL_MAX_MS;
}

export type AnalysisPhase =
  | "idle"
  | "connecting"
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface AnalysisState {
  phase: AnalysisPhase;
  queryId: string | null;
  runId: string | null;
  /** Echoed locally — the status schema drops the prompt text. */
  prompt: string | null;
  trace: TraceStep[];
  findings: Finding[];
  result: WorkflowResult | null;
  error: string | null;
  /** False while the trace socket is down; the UI says so rather than lying. */
  liveTrace: boolean;
}

const INITIAL: AnalysisState = {
  phase: "idle",
  queryId: null,
  runId: null,
  prompt: null,
  trace: [],
  findings: [],
  result: null,
  error: null,
  liveTrace: false,
};

/** Same step twice in a row is a duplicate from socket + status overlap. */
function appendTrace(existing: TraceStep[], incoming: TraceStep[]): TraceStep[] {
  const merged = [...existing];
  for (const step of incoming) {
    const last = merged[merged.length - 1];
    if (last && last.step === step.step && last.query_id === step.query_id) continue;
    merged.push(step);
  }
  return merged;
}

export function useAnalysisSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [state, setState] = useState<AnalysisState>(INITIAL);

  const socketRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Set when the socket reports completion, so the poller stops waiting. */
  const nudgeRef = useRef<(() => void) | null>(null);

  // ── Session bootstrap ───────────────────────────────────────────────────────
  // Reused across reloads so a refresh doesn't orphan the conversation
  // history the backend keeps per session.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      const cached =
        typeof window !== "undefined"
          ? window.sessionStorage.getItem("satquery:session_id")
          : null;

      if (cached) {
        try {
          await sessions.get(cached, controller.signal);
          if (!cancelled) setSessionId(cached);
          return;
        } catch (err) {
          // 404 means the backend restarted or the session was closed;
          // fall through and open a fresh one.
          if (err instanceof DOMException && err.name === "AbortError") return;
          window.sessionStorage.removeItem("satquery:session_id");
        }
      }

      try {
        const created = await sessions.create(controller.signal);
        if (cancelled) return;
        window.sessionStorage.setItem("satquery:session_id", created.session_id);
        setSessionId(created.session_id);
        setSessionError(null);
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setSessionError(
          err instanceof ApiError
            ? (err.detail ?? err.message)
            : "Could not open an analysis session.",
        );
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  // ── Trace socket ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    let socket: WebSocket;
    try {
      socket = new WebSocket(traceSocketUrl(sessionId));
    } catch {
      // Blocked (mixed content, proxy). Polling still covers correctness.
      return;
    }
    socketRef.current = socket;

    socket.onopen = () => setState((s) => ({ ...s, liveTrace: true }));

    socket.onmessage = (event) => {
      let step: TraceStep;
      try {
        step = JSON.parse(event.data as string) as TraceStep;
      } catch {
        return; // Non-JSON frame; nothing useful to show.
      }
      setState((s) => ({ ...s, trace: appendTrace(s.trace, [step]) }));

      if (step.step === "worker_completed" || step.step === "worker_failed") {
        nudgeRef.current?.();
      }
    };

    socket.onclose = () => setState((s) => ({ ...s, liveTrace: false }));
    socket.onerror = () => setState((s) => ({ ...s, liveTrace: false }));

    return () => {
      socketRef.current = null;
      // readyState CONNECTING sockets throw on close() in some browsers.
      if (socket.readyState === WebSocket.OPEN) socket.close();
    };
  }, [sessionId]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(
    () => () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  const submit = useCallback(
    async (text: string, assetIds: string[]) => {
      if (!sessionId) return;

      // Supersede anything still in flight.
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        ...INITIAL,
        phase: "connecting",
        prompt: text,
        liveTrace: socketRef.current?.readyState === WebSocket.OPEN,
      });

      let queryId: string;
      try {
        const submitted = await sessions.submitQuery(
          sessionId,
          text,
          assetIds,
          controller.signal,
        );
        queryId = submitted.query_id;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState((s) => ({
          ...s,
          phase: "failed",
          error:
            err instanceof ApiError
              ? (err.detail ?? err.message)
              : "Could not submit the query.",
        }));
        return;
      }

      setState((s) => ({ ...s, phase: "queued", queryId }));

      // ── Poll to terminal state ────────────────────────────────────────────
      const startedAt = Date.now();
      let attempt = 0;

      const tick = async () => {
        if (controller.signal.aborted) return;

        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setState((s) => ({
            ...s,
            phase: "failed",
            error:
              "The analysis did not finish within two minutes. The query worker may not be running.",
          }));
          return;
        }

        let status: Awaited<ReturnType<typeof sessions.queryStatus>>;
        try {
          status = await sessions.queryStatus(sessionId, queryId, controller.signal);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          // A transient failure mid-run shouldn't discard a live query —
          // keep polling and let the timeout above be the backstop.
          if (err instanceof ApiError && err.isTransient) {
            schedule();
            return;
          }
          setState((s) => ({
            ...s,
            phase: "failed",
            error:
              err instanceof ApiError
                ? (err.detail ?? err.message)
                : "Lost track of the query.",
          }));
          return;
        }

        const phase = mapStatus(status.status);
        setState((s) => ({
          ...s,
          phase: phase === "completed" ? s.phase : phase,
          trace: status.trace ? appendTrace(s.trace, status.trace) : s.trace,
          error: status.error ?? s.error,
        }));

        if (status.status === "failed") {
          setState((s) => ({
            ...s,
            phase: "failed",
            error: status.error ?? "The analysis pipeline reported a failure.",
          }));
          return;
        }

        if (status.status === "completed") {
          const runId = status.result?.run_id ?? null;
          if (!runId) {
            setState((s) => ({
              ...s,
              phase: "completed",
              error: "The run completed but returned no run_id.",
            }));
            return;
          }

          try {
            const result = await workflows.get(runId, controller.signal);
            setState((s) => ({
              ...s,
              phase: "completed",
              runId,
              result,
              findings: result.findings,
              trace: appendTrace(s.trace, result.trace ?? []),
              error: result.error ?? null,
            }));
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setState((s) => ({
              ...s,
              phase: "completed",
              runId,
              error:
                err instanceof ApiError
                  ? `Run finished, but its findings could not be loaded (${err.detail ?? err.message}).`
                  : "Run finished, but its findings could not be loaded.",
            }));
          }
          return;
        }

        schedule();
      };

      const schedule = () => {
        pollTimerRef.current = setTimeout(tick, pollDelay(attempt++));
      };

      // Let the socket short-circuit the wait when the worker reports done.
      nudgeRef.current = () => {
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        attempt = 0;
        void tick();
      };

      schedule();
    },
    [sessionId],
  );

  const reset = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    abortRef.current?.abort();
    setState((s) => ({ ...INITIAL, liveTrace: s.liveTrace }));
  }, []);

  return {
    sessionId,
    sessionError,
    ...state,
    isBusy:
      state.phase === "connecting" ||
      state.phase === "queued" ||
      state.phase === "processing",
    submit,
    reset,
  };
}

function mapStatus(status: QueryStatus): AnalysisPhase {
  switch (status) {
    case "queued":
      return "queued";
    case "processing":
      return "processing";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "processing";
  }
}
