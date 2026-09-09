"use client";

import * as THREE from "three";

import { latLonToVector3 } from "./geo";

/**
 * The globe's "fly to a place" flight — a Google-Earth-style move where the
 * planet turns the searched location to face you and swells to fill the
 * frame before handing off to the workspace.
 *
 * Like globeDrag and heroExit, the per-frame progress lives in a
 * module-level mutable object rather than React state: it changes every
 * frame and must not re-render the scene. GlobeSystem owns the one call
 * site that advances it and applies the plan to the globe group.
 *
 * The whole move is done on the GLOBE GROUP alone — rotation, position and
 * scale — and never touches the camera. Zooming by moving the camera would
 * fight OrbitControls' own damped update; growing and recentring the group
 * instead reads the same and leaves the camera rig untouched.
 */

/** Total flight time. Long enough to read as travel, not a jump-cut. */
export const FLY_MS = 3400;
/** Progress at which the covering veil starts to rise, hiding the cut. */
export const DIVE_AT = 0.82;

/** How large the globe grows, and how far along the view ray it settles. */
const END_SCALE = 2.6;
const END_RAY_FRACTION = 0.86;

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export interface FlightPlan {
  startQuat: THREE.Quaternion;
  /** North-up orientation of the current facing — the globe rights itself to
   *  here before it turns toward the target. */
  uprightQuat: THREE.Quaternion;
  /** North-up orientation with the target facing the camera. */
  targetQuat: THREE.Quaternion;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startScale: number;
  endScale: number;
}

/** Fraction of the flight spent righting the globe before it turns to the
 *  target. Small, because when the globe is already upright (nobody has
 *  tipped it) this phase is a no-op and shouldn't cost visible time. */
export const UPRIGHT_FRACTION = 0.32;

/**
 * Roll a quaternion about the view axis so the globe's north pole points
 * screen-up — "upright". Leaves which point faces the camera untouched; only
 * the roll around the line of sight changes.
 */
function northUp(quat: THREE.Quaternion, camDir: THREE.Vector3): THREE.Quaternion {
  const north = new THREE.Vector3(0, 1, 0).applyQuaternion(quat).projectOnPlane(camDir);
  const up = new THREE.Vector3(0, 1, 0).projectOnPlane(camDir);
  if (north.lengthSq() < 1e-8 || up.lengthSq() < 1e-8) return quat.clone();
  north.normalize();
  up.normalize();
  const angle = Math.acos(THREE.MathUtils.clamp(north.dot(up), -1, 1));
  const sign =
    new THREE.Vector3().crossVectors(north, up).dot(camDir) < 0 ? -1 : 1;
  const roll = new THREE.Quaternion().setFromAxisAngle(camDir, angle * sign);
  return roll.multiply(quat.clone());
}

export const flyAnim: { active: boolean; t: number; plan: FlightPlan | null } = {
  active: false,
  t: 0,
  plan: null,
};

export function beginFlyAnim(): void {
  flyAnim.active = true;
  flyAnim.t = 0;
  flyAnim.plan = null; // computed on the first frame, when the group is live
}

export function resetFlyAnim(): void {
  flyAnim.active = false;
  flyAnim.t = 0;
  flyAnim.plan = null;
}

export function stepFlyAnim(delta: number): number {
  if (!flyAnim.active) return flyAnim.t;
  flyAnim.t = Math.min(1, flyAnim.t + (delta * 1000) / FLY_MS);
  return flyAnim.t;
}

/**
 * Ease-in-out cubic. The flight starts gently (the globe is a heavy body,
 * not a UI element that snaps), accelerates through the turn, then eases as
 * the target settles under the camera.
 */
export function flyEase(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Work out the flight once, at its first frame, from the globe's current
 * pose and where the target latitude/longitude sits on it.
 *
 * `earthY` folds in the Earth mesh's own idle rotation (frozen for the
 * duration of the flight) so the target lands facing the camera even though
 * that spin isn't part of the group transform.
 */
export function planFlight(opts: {
  lat: number;
  lon: number;
  earthY: number;
  currentQuat: THREE.Quaternion;
  currentPos: THREE.Vector3;
  currentScale: number;
  cameraPos: THREE.Vector3;
  lookTarget: THREE.Vector3;
}): FlightPlan {
  // Direction of the target on the globe, in the group's local frame, with
  // the frozen idle spin folded in.
  const placeLocal = latLonToVector3(opts.lat, opts.lon)
    .applyAxisAngle(Y_AXIS, opts.earthY)
    .normalize();

  // The face we want that point to end up pointing at: from the globe's
  // resting spot toward the camera. Using the look target (not the origin)
  // is what makes the place end up centred in frame rather than off to the
  // side where the globe normally sits.
  const camDir = opts.cameraPos.clone().sub(opts.lookTarget).normalize();

  // Shortest-arc turn that brings the target to face the camera, then rolled
  // upright so north points screen-up rather than landing at a tilt.
  const align = new THREE.Quaternion().setFromUnitVectors(placeLocal, camDir);
  const targetQuat = northUp(align, camDir);

  // Where the globe rights itself to before it turns: its current facing,
  // rolled upright. When it's already upright this equals the start, so the
  // righting phase simply passes through.
  const uprightQuat = northUp(opts.currentQuat, camDir);

  // Settle the globe on the camera→look-target ray, closer to the camera so
  // it reads as approach rather than just growth.
  const endPos = opts.cameraPos
    .clone()
    .lerp(opts.lookTarget, END_RAY_FRACTION);

  return {
    startQuat: opts.currentQuat.clone(),
    uprightQuat,
    targetQuat,
    startPos: opts.currentPos.clone(),
    endPos,
    startScale: opts.currentScale,
    endScale: END_SCALE,
  };
}
