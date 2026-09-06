"use client";

/**
 * Fades the entire hero stage — canvas, starfield, and the drei `<Html>`
 * panels anchored to the globe — during the departure animation.
 *
 * The panels are the reason this exists. They're DOM nodes portalled out by
 * drei and positioned in screen space, so they sit outside HeroOverlay and
 * don't inherit its fade, and being screen-space they don't shrink with the
 * group transform either. Without this the globe flies off and leaves three
 * annotation cards hanging over empty sky.
 *
 * The fade is delayed into the back half of the departure so the flight
 * itself is what the eye follows; the dissolve only closes it out.
 */

import type { ReactNode } from "react";

import { useHeroTransitionStore } from "@/hooks/useHeroTransition";
import { HERO_EXIT_MS } from "@/lib/heroExit";

export default function HeroFade({ children }: { children: ReactNode }) {
  const isExiting = useHeroTransitionStore((s) => s.isExiting);

  return (
    <div
      className="absolute inset-0"
      style={{
        opacity: isExiting ? 0 : 1,
        transition: isExiting
          ? `opacity ${Math.round(HERO_EXIT_MS * 0.5)}ms ease-in ${Math.round(
              HERO_EXIT_MS * 0.45,
            )}ms`
          : "none",
      }}
    >
      {children}
    </div>
  );
}
