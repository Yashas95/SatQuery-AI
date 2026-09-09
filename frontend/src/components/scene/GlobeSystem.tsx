"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
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
import {
  DIVE_AT,
  UPRIGHT_FRACTION,
  beginFlyAnim,
  flyAnim,
  flyEase,
  planFlight,
  resetFlyAnim,
  stepFlyAnim,
} from "@/lib/flyTo";
import { earthMeshRef } from "@/lib/earthMeshRef";
import { useFlyToStore } from "@/hooks/useFlyToStore";

/** Fallback look target if OrbitControls isn't wired yet — mirrors the value
 *  set in CameraRig, which frames the globe to the right of centre. */
const DEFAULT_LOOK = new THREE.Vector3(-1.45, -0.05, 0);

/**
 * Everything that belongs to the planet — the globe, its orbit ring, the
 * satellite, the scan patch and the data trace — rides inside this group,
 * so a drag turns the whole system as one rigid body instead of spinning
 * the Earth out from under a stationary orbit.
 *
 * This is also where the "fly to a place" flight is applied: while a flight
 * is live the group's rotation, position and scale are driven from the
 * flight plan and the ordinary drag/idle transforms are held off.
 */
export default function GlobeSystem({ children }: { children: ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | { target?: THREE.Vector3 }
    | null;

  useGlobeDragListeners();

  // A completed departure leaves progress at 1, so clear it — then fly the
  // globe back in. Also clear any stale flight so a return to the hero after
  // a fly-through starts from rest, not mid-dive.
  useEffect(() => {
    resetHeroExit();
    resetFlyAnim();
    if (useFlyToStore.getState().phase !== "idle") {
      useFlyToStore.getState().reset();
    }
    beginHeroEntry();
    return resetHeroExit;
  }, []);

  useFrame((_, delta) => {
    stepGlobeDrag();
    stepHeroExit(delta);
    stepHeroEntry(delta);

    const g = groupRef.current;
    if (!g) return;

    const fly = useFlyToStore.getState();

    // ── Fly-to-place: owns the group transform while live ──────────────────
    if (fly.phase !== "idle") {
      if (!flyAnim.active) beginFlyAnim();

      // Plan the flight on its first frame, when the group and camera are
      // live and the Earth's idle spin can be frozen at a known angle.
      if (!flyAnim.plan && fly.target) {
        flyAnim.plan = planFlight({
          lat: fly.target.lat,
          lon: fly.target.lon,
          earthY: earthMeshRef.current?.rotation.y ?? 0,
          currentQuat: g.quaternion.clone(),
          currentPos: g.position.clone(),
          currentScale: g.scale.x,
          cameraPos: camera.position.clone(),
          lookTarget: controls?.target?.clone() ?? DEFAULT_LOOK.clone(),
        });
      }

      const t = stepFlyAnim(delta);
      const plan = flyAnim.plan;
      if (plan) {
        // Rotation in two beats so the planet is never seen tumbling at an
        // angle: first right it to upright, then turn it to the place.
        if (t < UPRIGHT_FRACTION) {
          const e = flyEase(t / UPRIGHT_FRACTION);
          g.quaternion.slerpQuaternions(plan.startQuat, plan.uprightQuat, e);
        } else {
          const e = flyEase((t - UPRIGHT_FRACTION) / (1 - UPRIGHT_FRACTION));
          g.quaternion.slerpQuaternions(plan.uprightQuat, plan.targetQuat, e);
        }
        // Position and scale ease across the whole flight.
        const ez = flyEase(t);
        g.position.lerpVectors(plan.startPos, plan.endPos, ez);
        g.scale.setScalar(
          plan.startScale + (plan.endScale - plan.startScale) * ez,
        );
      }

      // Raise the veil near the end, then hand off once fully arrived. Both
      // are no-ops after the first call (guarded in the store).
      if (t >= DIVE_AT) fly.dive();
      if (t >= 1) fly.arrive();
      return;
    }

    // ── Idle / drag / hero travel ──────────────────────────────────────────
    if (flyAnim.active) resetFlyAnim();

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
    } else {
      // Neither travel nor flight — make sure a prior move's offset/scale
      // doesn't linger.
      g.position.set(0, 0, 0);
      g.scale.setScalar(1);
    }
  });

  return <group ref={groupRef}>{children}</group>;
}
