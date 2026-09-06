"use client";

/**
 * The sky. One layer, mounted in the ROOT layout, so it is the same DOM
 * node on the landing page and in the workspace — navigating between them
 * doesn't tear it down and build a different one.
 *
 * The motion is a continuous one-way drift, not a nudge that returns.
 * Navigating adds an impulse that decays back to the base speed, so moving
 * around the app reads as travelling further along the same journey. An
 * animation that went out and came back turned every navigation into a
 * left-right twitch — the sky ended up exactly where it started, which is
 * the opposite of going somewhere.
 *
 * Because the drift never reverses, the offset grows without bound, so the
 * star field is rendered twice side by side and the offset wraps at one
 * tile width. The seam is invisible: the copy arriving on the right is
 * identical to the one leaving on the left.
 *
 * Driven by rAF rather than CSS keyframes. A keyframe animation can loop
 * forever or ease to a target, but it can't carry a velocity that varies
 * with what the user just did, and retiming one mid-flight jumps.
 *
 * SVG, not a second WebGL canvas: this sits behind a working surface where
 * people pan and zoom heavy imagery, and a live three.js scene competing
 * for the GPU is what makes that feel sluggish.
 *
 * Star positions come from a seeded generator rather than `Math.random`.
 * Random values would differ between the server render and the client
 * hydration, and React would throw a mismatch on every load.
 */

import { useEffect, useMemo, useRef } from "react";

import { useHeroTransitionStore } from "@/hooks/useHeroTransition";
import { prefersReducedMotion } from "@/lib/heroExit";

/** Base drift, px/sec. Slow enough to read as depth, not as a screensaver. */
const BASE_SPEED = 5;
/** Extra px/sec injected on navigation, by how far you travelled. */
const IMPULSE = { full: 320, short: 120 } as const;
/** Fraction of the impulse remaining after one second. */
const DECAY_PER_SECOND = 0.06;

/** mulberry32 — small, fast, and deterministic for a given seed. */
function seededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
  /** Only a fraction twinkle; animating all of them costs more and, oddly,
   *  looks less real — a sky where everything shimmers reads as noise. */
  twinkle: { duration: number; delay: number } | null;
}

const STAR_COUNT = 260;

function buildStars(): Star[] {
  const random = seededRandom(20260904);
  const stars: Star[] = [];

  for (let i = 0; i < STAR_COUNT; i += 1) {
    // Raising the magnitude to a power skews the distribution hard toward
    // faint stars, leaving only a handful bright. A uniform distribution
    // gives every star the same weight, which is what makes a procedural
    // sky read as noise rather than as a night sky.
    const magnitude = Math.pow(random(), 2.8);
    const shouldTwinkle = random() < 0.12;
    stars.push({
      cx: random() * 100,
      cy: random() * 100,
      r: 0.35 + magnitude * 1.05,
      opacity: 0.18 + magnitude * 0.72,
      twinkle: shouldTwinkle
        ? { duration: 2.6 + random() * 4.2, delay: random() * 5 }
        : null,
    });
  }

  return stars;
}

export default function SpaceBackdrop() {
  const stars = useMemo(() => buildStars(), []);
  const travelNonce = useHeroTransitionStore((s) => s.travelNonce);
  const travelVariant = useHeroTransitionStore((s) => s.travelVariant);

  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const velocityRef = useRef(BASE_SPEED);

  // Each navigation bumps the nonce; that's the impulse. Applied as a
  // velocity change rather than a position jump so the sky accelerates
  // into the move instead of teleporting.
  useEffect(() => {
    if (travelNonce === 0) return;
    velocityRef.current += IMPULSE[travelVariant];
  }, [travelNonce, travelVariant]);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    let frame = 0;
    let last = performance.now();
    // Cached rather than read per frame: `clientWidth` forces a layout
    // flush, and doing that every frame behind a pannable image viewer is
    // exactly the kind of thing that shows up as jank.
    let tileWidth = window.innerWidth;
    const measure = () => {
      tileWidth = window.innerWidth;
    };
    window.addEventListener("resize", measure);

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); // clamp after a stall
      last = now;

      // Exponential decay toward the base speed.
      const excess = velocityRef.current - BASE_SPEED;
      velocityRef.current =
        BASE_SPEED + excess * Math.pow(DECAY_PER_SECOND, dt);

      offsetRef.current = (offsetRef.current + velocityRef.current * dt) % tileWidth;

      const track = trackRef.current;
      if (track) {
        track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    // z-0, not a negative z-index: a negative value paints *behind* the
    // body's own background box, which is opaque, so the sky disappeared
    // entirely. Screens sit above this on z-10.
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      {/* Ground for every screen, both themes. Painted here rather than on
          each shell so nothing opaque sits between the sky and the page. */}
      <div className="absolute inset-0 bg-[var(--page-canvas)]" />

      <div className="sq-space absolute inset-0 overflow-hidden">
        {/* Ambient depth. Deliberately outside the moving track: two soft
            washes scrolling past on a loop would announce the tile seam
            that the stars themselves hide. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 18% 12%, rgba(45,110,160,0.16), transparent 70%), radial-gradient(55% 45% at 85% 78%, rgba(120,70,150,0.12), transparent 72%)",
          }}
        />

        {/* Two identical tiles, each one viewport wide. The offset wraps at
            one tile width, so the pair scrolls forever without an edge. */}
        <div
          ref={trackRef}
          className="absolute inset-y-0 left-0 flex w-[200%] will-change-transform"
        >
          <StarTile stars={stars} />
          <StarTile stars={stars} />
        </div>
      </div>
    </div>
  );
}

function StarTile({ stars }: { stars: Star[] }) {
  return (
    <svg
      className="h-full w-1/2 shrink-0"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {stars.map((star, index) => (
        <circle
          key={index}
          cx={star.cx}
          cy={star.cy}
          // preserveAspectRatio="none" stretches the viewBox to the tile, so
          // radii stay small enough that the distortion is invisible.
          r={star.r * 0.12}
          fill="#ffffff"
          opacity={star.opacity}
          className={star.twinkle ? "sq-twinkle" : undefined}
          style={
            star.twinkle
              ? {
                  animationDuration: `${star.twinkle.duration}s`,
                  animationDelay: `${star.twinkle.delay}s`,
                }
              : undefined
          }
        />
      ))}
    </svg>
  );
}
