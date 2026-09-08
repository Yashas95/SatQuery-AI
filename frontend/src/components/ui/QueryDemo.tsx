"use client";

import { useEffect, useRef, useState } from "react";
import { useHeroExitNavigation } from "@/hooks/useHeroTransition";
import { useSceneStore } from "@/hooks/useSceneStore";
import { palette } from "@/lib/theme";

const SAMPLE_QUERIES = [
  "What changed in this region between 2022 and 2026?",
  "Find all built-up areas near the coastline.",
  "Compare optical and SAR — which changes look significant?",
  "What is visible in this image?",
];


export default function QueryDemo() {
  const [value, setValue] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [typed, setTyped] = useState("");

  const runQueryDemo = useSceneStore((s) => s.runQueryDemo);
  const state = useSceneStore((s) => s.state);
  const isActive = state === "query-active";

  const inputRef = useRef<HTMLInputElement>(null);
  const { exitTo } = useHeroExitNavigation();

  // Rotating typewriter placeholder — stops once the user types.
  useEffect(() => {
    if (value.length > 0) return;
    const full = SAMPLE_QUERIES[placeholderIndex];
    let char = 0;
    let holdTimer: ReturnType<typeof setTimeout>;

    const typeTimer = setInterval(() => {
      char += 1;
      setTyped(full.slice(0, char));
      if (char >= full.length) {
        clearInterval(typeTimer);
        holdTimer = setTimeout(() => {
          setPlaceholderIndex((i) => (i + 1) % SAMPLE_QUERIES.length);
        }, 2600);
      }
    }, 38);

    return () => {
      clearInterval(typeTimer);
      clearTimeout(holdTimer);
    };
  }, [placeholderIndex, value.length]);


  /**
   * Two different intents share this button, so it reads them apart:
   *
   * - Nothing typed → the visitor is looking, not asking. Play the
   *   on-globe demo, which is what the hero is here to show.
   * - Something typed → that's a real question. Carry it into the
   *   workspace rather than answering it with an animation, which would
   *   be theatre dressed up as a result.
   */
  const submit = () => {
    const typedQuery = value.trim();

    if (!typedQuery) {
      runQueryDemo(SAMPLE_QUERIES[placeholderIndex]);
      inputRef.current?.blur();
      return;
    }

    exitTo(`/analyze?q=${encodeURIComponent(typedQuery)}`);
  };

  return (
    <div className="w-full max-w-xl">
      <div
        className="group relative flex items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur-xl transition-all duration-300"
        style={{
          background: "rgba(8, 14, 26, 0.62)",
          borderColor: isActive
            ? "rgba(61, 219, 224, 0.65)"
            : "rgba(61, 219, 224, 0.24)",
          boxShadow: isActive
            ? "0 0 40px rgba(61,219,224,0.18)"
            : "0 8px 32px rgba(0,0,0,0.45)",
        }}
      >
        <span
          className="font-mono text-xs"
          style={{ color: isActive ? palette.cyan : palette.textMuted }}
        >
          &gt;
        </span>

        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          aria-label="Ask a question about satellite imagery"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-transparent"
          style={{ color: palette.textPrimary }}
        />

        {value.length === 0 && (
          <span
            className="pointer-events-none absolute left-10 text-sm"
            style={{ color: "rgba(159,180,194,0.62)" }}
          >
            {typed}
            <span className="ml-0.5 inline-block animate-pulse">▍</span>
          </span>
        )}

        <button
          onClick={submit}
          className="shrink-0 rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-all duration-200 hover:brightness-125"
          style={{
            background: "rgba(61,219,224,0.14)",
            border: "1px solid rgba(61,219,224,0.4)",
            color: palette.cyanSoft,
          }}
        >
          Analyse
        </button>
      </div>
    </div>
  );
}
