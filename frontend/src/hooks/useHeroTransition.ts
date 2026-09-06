"use client";

/**
 * Navigation between the landing page and the workspace, as one movement.
 *
 * Two things travel together: the globe (a 3D flight, driven per-frame in
 * GlobeSystem) and the star field (a DOM layer that lives in the ROOT
 * layout, so it survives the route change instead of being torn down and
 * rebuilt). The store below is what keeps them in step.
 *
 * `travelNonce` exists because the star animation has to outlive the
 * navigation that started it. Driving it from a boolean would cut it short
 * the moment the flag resets; bumping a nonce and keying the animated
 * element off it restarts a fixed-duration animation that then runs to
 * completion on its own.
 */

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { create } from "zustand";

import {
  HERO_EXIT_MS,
  beginHeroExit,
  prefersReducedMotion,
} from "@/lib/heroExit";

/**
 * How hard a navigation pushes the sky.
 *
 * `full` accompanies the globe's flight to or from the landing page.
 * `short` is for moving between analysis screens — the same motion with
 * less behind it, because a tab switch is a step sideways, not a journey.
 *
 * There is no direction. The sky drifts one way, always, and navigating
 * only ever advances it further; reversing it on a "backwards" navigation
 * is what made the movement read as a twitch rather than as travel.
 */
export type TravelVariant = "full" | "short";

interface HeroTransitionStore {
  /** True from the moment the departure starts until the route changes. */
  isExiting: boolean;
  /** Bumped once per navigation. SpaceBackdrop turns it into an impulse. */
  travelNonce: number;
  travelVariant: TravelVariant;

  setExiting: (exiting: boolean) => void;
  travel: (variant?: TravelVariant) => void;
}

export const useHeroTransitionStore = create<HeroTransitionStore>((set) => ({
  isExiting: false,
  travelNonce: 0,
  travelVariant: "full",

  setExiting: (isExiting) => set({ isExiting }),
  travel: (travelVariant = "full") =>
    set((s) => ({ travelVariant, travelNonce: s.travelNonce + 1 })),
}));

/**
 * Leaving the landing page: play the departure, then navigate.
 *
 * Prefetches the destination as soon as the animation begins, so the 900ms
 * of globe flight doubles as load time and the workspace is ready when the
 * route finally changes — otherwise the animation ends on a blank frame
 * while Next fetches the chunk, which is worse than no animation at all.
 */
export function useHeroExitNavigation() {
  const router = useRouter();
  const isExiting = useHeroTransitionStore((s) => s.isExiting);
  const setExiting = useHeroTransitionStore((s) => s.setExiting);
  const travel = useHeroTransitionStore((s) => s.travel);

  const exitTo = useCallback(
    (href: string) => {
      // Ignore repeat clicks while a departure is already under way.
      if (useHeroTransitionStore.getState().isExiting) return;

      if (prefersReducedMotion()) {
        router.push(href);
        return;
      }

      router.prefetch(href);
      setExiting(true);
      beginHeroExit();
      travel("full");

      window.setTimeout(() => router.push(href), HERO_EXIT_MS);
      // Cleared on a slightly longer fuse rather than alongside the push:
      // clearing it in the same tick would flash the hero back into view
      // for a frame before the new route paints. By the time this fires the
      // hero is unmounted, so the flag is only reset for the next visit.
      window.setTimeout(() => setExiting(false), HERO_EXIT_MS + 300);
    },
    [router, setExiting, travel],
  );

  return { exitTo, isExiting };
}

/**
 * Navigation from inside the workspace — both back to the landing page and
 * between analysis screens.
 *
 * There's no 3D scene to animate out here (the workspace is DOM), so this
 * navigates immediately and lets the sky carry the movement. Going home
 * additionally hands off to the hero's own entry flight, which plays on
 * mount.
 */
export function useTravelNavigation() {
  const router = useRouter();
  const travel = useHeroTransitionStore((s) => s.travel);

  return useCallback(
    (href: string, variant: TravelVariant) => {
      if (!prefersReducedMotion()) travel(variant);
      router.push(href);
    },
    [router, travel],
  );
}
