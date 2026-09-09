"use client";

import { useFlyToStore } from "@/hooks/useFlyToStore";

/**
 * The dissolve at the end of a fly-to-place flight.
 *
 * The globe swells to fill the frame and then the route changes to the
 * workspace — a hard swap between a WebGL scene and a document. This black
 * veil rises over the last beat of the flight (the "diving" phase) so the
 * eye is looking at black at the instant of the cut, not at a jarring jump.
 * Timed to reach full opacity right as the flight completes and navigates.
 */
export default function FlyVeil() {
  const phase = useFlyToStore((s) => s.phase);
  const active = phase === "diving" || phase === "arrived";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30"
      style={{
        background: "#000",
        opacity: active ? 1 : 0,
        transition: active ? "opacity 620ms ease-in" : "none",
      }}
    />
  );
}
