/**
 * The globe's departure and return flights.
 *
 * Progress lives in module-level mutable objects rather than React state,
 * the same way `globeDrag` does: these change every frame, and routing them
 * through `useState` would re-render the whole scene tree 60 times a second
 * to move one group.
 *
 * The DOM side (the veil, the fading overlay, the star travel) uses a normal
 * store — those flip once per navigation, not per frame.
 */

/** Long enough to read as departure, short enough not to feel like a wait. */
export const HERO_EXIT_MS = 900;
/** The return is slightly slower — arriving should settle, not slam. */
export const HERO_ENTRY_MS = 1150;

/** How far left, and how far back, the globe travels. Shared by both
 *  flights so the departure and the return trace the same path. */
const TRAVEL_X = -7.5;
const TRAVEL_Z = -3;
const TRAVEL_SHRINK = 0.35;

export const heroExit = { active: false, t: 0 };
export const heroEntry = { active: false, t: 0 };

// ── Departure ─────────────────────────────────────────────────────────────────

export function beginHeroExit(): void {
  heroExit.active = true;
  heroExit.t = 0;
}

export function resetHeroExit(): void {
  heroExit.active = false;
  heroExit.t = 0;
}

export function stepHeroExit(delta: number): void {
  if (!heroExit.active) return;
  heroExit.t = Math.min(1, heroExit.t + (delta * 1000) / HERO_EXIT_MS);
}

/**
 * Ease-in cubic: the globe holds still for a beat, then accelerates out.
 * Ease-*out* here would have it lurch immediately and coast, which reads as
 * the page being yanked away rather than the camera leaving.
 */
export function heroExitEase(): number {
  const t = heroExit.t;
  return t * t * t;
}

// ── Return ────────────────────────────────────────────────────────────────────

export function beginHeroEntry(): void {
  heroEntry.active = true;
  heroEntry.t = 0;
}

export function stepHeroEntry(delta: number): void {
  if (!heroEntry.active) return;
  heroEntry.t = Math.min(1, heroEntry.t + (delta * 1000) / HERO_ENTRY_MS);
  if (heroEntry.t >= 1) heroEntry.active = false;
}

/**
 * Ease-out cubic — the mirror of the departure. The globe arrives fast and
 * decelerates into place, which is what makes it read as coming to rest
 * rather than sliding to a mechanical stop.
 */
export function heroEntryEase(): number {
  const t = heroEntry.t;
  return 1 - Math.pow(1 - t, 3);
}

// ── Shared placement ──────────────────────────────────────────────────────────

/**
 * Where the globe sits for a given flight progress. `p` is 0 at rest in
 * frame and 1 at full travel, so the departure passes its eased progress
 * straight in and the return passes `1 - eased`.
 */
export function globeTravelTransform(p: number) {
  return {
    x: TRAVEL_X * p,
    z: TRAVEL_Z * p,
    scale: 1 - TRAVEL_SHRINK * p,
  };
}

/** Honour the OS setting — this is decorative motion, and a large moving
 *  object is exactly what vestibular sensitivity reacts to. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
