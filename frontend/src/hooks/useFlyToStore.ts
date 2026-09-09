"use client";

import { create } from "zustand";

import type { GeoPlace } from "@/lib/geo";

/**
 * Drives the "fly to a place" globe interaction from React land.
 *
 * The per-frame motion itself lives in module-level mutable state (see
 * lib/flyTo.ts and GlobeSystem) so it never re-renders the scene; this
 * store only holds the handful of things React actually needs to react to:
 * which place we're going to, and which phase the flight is in.
 *
 *   idle    — nothing happening
 *   flying  — the globe is rotating and zooming toward the target
 *   diving  — the last beat: a veil fades up to cover the hard cut
 *   arrived — the flight finished; the trigger navigates to the workspace
 */
export type FlyPhase = "idle" | "flying" | "diving" | "arrived";

interface FlyToStore {
  phase: FlyPhase;
  target: GeoPlace | null;

  begin: (target: GeoPlace) => void;
  dive: () => void;
  arrive: () => void;
  reset: () => void;
}

export const useFlyToStore = create<FlyToStore>((set) => ({
  phase: "idle",
  target: null,

  begin: (target) => set({ phase: "flying", target }),
  // Single flips, not per-frame writes — GlobeSystem calls each once as the
  // flight crosses the relevant threshold, and CSS handles the timing.
  dive: () => set((s) => (s.phase === "flying" ? { phase: "diving" } : s)),
  arrive: () => set((s) => (s.phase === "diving" ? { phase: "arrived" } : s)),
  reset: () => set({ phase: "idle", target: null }),
}));
