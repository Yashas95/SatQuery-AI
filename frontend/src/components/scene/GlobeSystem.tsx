"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import {
  globeDrag,
  stepGlobeDrag,
  useGlobeDragListeners,
} from "@/lib/globeDrag";
import {
  beginHeroEntry,
  globeTravelTransform,
  heroEntry,
  heroEntryEase,
  heroExit,
  heroExitEase,
  resetHeroExit,
  stepHeroEntry,
  stepHeroExit,
} from "@/lib/heroExit";

/**
 * Everything that belongs to the planet — the globe, its orbit ring, the
 * satellite, the scan patch and the data trace — rides inside this group,
 * so a drag turns the whole system as one rigid body instead of spinning
 * the Earth out from under a stationary orbit.
 */
export default function GlobeSystem({ children }: { children: ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useGlobeDragListeners();

  // A completed departure leaves progress at 1, so clear it — then fly the
  // globe back in. The entry runs on every mount, including a cold load:
  // arriving under power looks intentional either way, and it saves
  // threading "did we come from the workspace?" through the router.
  useEffect(() => {
    resetHeroExit();
    beginHeroEntry();
    return resetHeroExit;
  }, []);

  useFrame((_, delta) => {
    stepGlobeDrag();
    stepHeroExit(delta);
    stepHeroEntry(delta);

    const g = groupRef.current;
    if (!g) return;

    g.rotation.y = globeDrag.spin;
    // Ease the tilt so a flick doesn't snap the axis over.
    g.rotation.x += (globeDrag.tilt - g.rotation.x) * Math.min(1, delta * 6);

    // Departure wins if both are somehow live — leaving is the newer intent.
    if (heroExit.active) {
      const p = heroExitEase();
      // Left and receding, not just left: pure sideways travel reads as a
      // slide across glass, while pulling away as it goes reads as distance
      // opening up behind you.
      const { x, z, scale } = globeTravelTransform(p);
      g.position.set(x, 0, z);
      g.scale.setScalar(scale);
      // Extra spin on the way out, so the planet carries its own momentum
      // instead of looking dragged off on a rail.
      g.rotation.y += p * delta * 1.6;
    } else if (heroEntry.active) {
      // Same path, run backwards: 1 → 0 brings it in from where the
      // departure left it, so the round trip retraces one route.
      const p = 1 - heroEntryEase();
      const { x, z, scale } = globeTravelTransform(p);
      g.position.set(x, 0, z);
      g.scale.setScalar(scale);
      g.rotation.y += p * delta * 1.2;
    }
  });

  return <group ref={groupRef}>{children}</group>;
}
