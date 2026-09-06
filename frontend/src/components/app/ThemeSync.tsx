"use client";

/**
 * Headless twin of the hero's ThemeControls: reads the persisted appearance
 * choice and mirrors it onto <html> so the CSS variables flip.
 *
 * The hero couples this to its globe-style picker; the analysis screens need
 * the same side effect without that UI, and duplicating the effect inside
 * TopNav would mean the theme depends on the masthead being mounted.
 */

import { useEffect } from "react";

import { useAppearanceStore } from "@/hooks/useAppearanceStore";

export default function ThemeSync() {
  const mode = useAppearanceStore((s) => s.mode);
  const hydrated = useAppearanceStore((s) => s.hydrated);
  const hydrate = useAppearanceStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dataset.theme = mode;
    // Tells the UA to render form controls and scrollbars to match.
    document.documentElement.style.colorScheme = mode;
  }, [mode, hydrated]);

  return null;
}
