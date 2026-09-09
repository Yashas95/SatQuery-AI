"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useHeroExitNavigation } from "@/hooks/useHeroTransition";
import { useSceneStore } from "@/hooks/useSceneStore";
import { useFlyToStore } from "@/hooks/useFlyToStore";
import { geocodePlace, placeLabel, type GeoPlace } from "@/lib/geo";
import { prefersReducedMotion } from "@/lib/heroExit";
import { palette } from "@/lib/theme";

/** Placeholder hints — places, not questions, since typing a place is what
 *  now flies the globe there. */
const PLACE_HINTS = [
  "Mumbai",
  "Paris",
  "Amazon Rainforest",
  "Tokyo",
  "New Delhi",
  "Great Barrier Reef",
];

/** Used only for the on-globe demo when the box is submitted empty. */
const DEMO_QUERY = "What changed in this region between 2022 and 2026?";

export default function QueryDemo() {
  const [value, setValue] = useState("");
  const [hintIndex, setHintIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [locating, setLocating] = useState(false);

  const runQueryDemo = useSceneStore((s) => s.runQueryDemo);
  const sceneState = useSceneStore((s) => s.state);
  const isActive = sceneState === "query-active";

  const flyPhase = useFlyToStore((s) => s.phase);
  const flyTarget = useFlyToStore((s) => s.target);
  const beginFly = useFlyToStore((s) => s.begin);

  const router = useRouter();
  const { exitTo } = useHeroExitNavigation();

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingPlace = useRef<GeoPlace | null>(null);
  const navigated = useRef(false);

  const flying = flyPhase !== "idle";
  const busy = flying || locating;

  // Rotating typewriter placeholder — stops once the user types.
  useEffect(() => {
    if (value.length > 0) return;
    const full = PLACE_HINTS[hintIndex];
    let char = 0;
    let holdTimer: ReturnType<typeof setTimeout>;

    const typeTimer = setInterval(() => {
      char += 1;
      setTyped(full.slice(0, char));
      if (char >= full.length) {
        clearInterval(typeTimer);
        holdTimer = setTimeout(() => {
          setHintIndex((i) => (i + 1) % PLACE_HINTS.length);
        }, 2400);
      }
    }, 55);

    return () => {
      clearInterval(typeTimer);
      clearTimeout(holdTimer);
    };
  }, [hintIndex, value.length]);

  // When the flight finishes, carry the place into the workspace. Guarded so
  // it fires exactly once even though the phase lingers at "arrived" until
  // this component unmounts on navigation.
  useEffect(() => {
    if (flyPhase === "arrived" && !navigated.current && pendingPlace.current) {
      navigated.current = true;
      const p = pendingPlace.current;
      const params = new URLSearchParams({
        q: p.name,
        place: placeLabel(p),
        lat: p.lat.toFixed(5),
        lon: p.lon.toFixed(5),
      });
      router.push(`/analyze?${params.toString()}`);
    }
  }, [flyPhase, router]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * The button and Enter share this. Empty box → play the on-globe demo the
   * hero is here to show. A place name → geocode it and fly there. Anything
   * the geocoder can't place (e.g. a full sentence) → take it straight into
   * the workspace as a question, so nothing dead-ends.
   */
  const submit = async () => {
    if (busy) return;
    const query = value.trim();

    if (!query) {
      runQueryDemo(DEMO_QUERY);
      inputRef.current?.blur();
      return;
    }

    setLocating(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const place = await geocodePlace(query, ac.signal);
    if (ac.signal.aborted) return;
    setLocating(false);

    if (!place) {
      // Not a recognisable place — treat it as a question and hand off.
      exitTo(`/analyze?q=${encodeURIComponent(query)}`);
      return;
    }

    pendingPlace.current = place;

    if (prefersReducedMotion()) {
      const params = new URLSearchParams({
        q: place.name,
        place: placeLabel(place),
        lat: place.lat.toFixed(5),
        lon: place.lon.toFixed(5),
      });
      router.push(`/analyze?${params.toString()}`);
      return;
    }

    inputRef.current?.blur();
    beginFly(place);
  };

  const statusText = flying
    ? `Flying to ${flyTarget?.name ?? "location"}…`
    : locating
      ? "Locating…"
      : null;

  return (
    <div className="w-full max-w-xl">
      <div
        className="group relative flex items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur-xl transition-all duration-300"
        style={{
          background: "rgba(8, 14, 26, 0.62)",
          borderColor:
            isActive || busy
              ? "rgba(61, 219, 224, 0.65)"
              : "rgba(61, 219, 224, 0.24)",
          boxShadow:
            isActive || busy
              ? "0 0 40px rgba(61,219,224,0.18)"
              : "0 8px 32px rgba(0,0,0,0.45)",
        }}
      >
        <span
          className="font-mono text-xs"
          style={{ color: isActive || busy ? palette.cyan : palette.textMuted }}
        >
          &gt;
        </span>

        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          disabled={busy}
          aria-label="Search a place to fly there"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-transparent disabled:opacity-70"
          style={{ color: palette.textPrimary }}
        />

        {value.length === 0 && !busy && (
          <span
            className="pointer-events-none absolute left-10 text-sm"
            style={{ color: "rgba(159,180,194,0.62)" }}
          >
            Search a place — {typed}
            <span className="ml-0.5 inline-block animate-pulse">▍</span>
          </span>
        )}

        <button
          onClick={() => void submit()}
          disabled={busy}
          className="shrink-0 rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-all duration-200 hover:brightness-125 disabled:opacity-70"
          style={{
            background: "rgba(61,219,224,0.14)",
            border: "1px solid rgba(61,219,224,0.4)",
            color: palette.cyanSoft,
          }}
        >
          {busy ? "···" : "Fly there"}
        </button>
      </div>

      {statusText && (
        <div
          className="mt-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.04em]"
          style={{ color: palette.cyanSoft }}
        >
          {(locating || flying) && (
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 animate-spin rounded-full border border-current border-t-transparent"
              aria-hidden
            />
          )}
          <span>{statusText}</span>
        </div>
      )}
    </div>
  );
}
