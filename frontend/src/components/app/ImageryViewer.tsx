"use client";

/**
 * Pan/zoom viewer for a single asset, with model detections drawn over it.
 *
 * Two things here are load-bearing and easy to get subtly wrong:
 *
 * 1. **Box coordinate space.** `BoundingBox.crs` decides how to read the
 *    numbers. When it's null the box is in source-image pixels. When it's
 *    set the box is in map units and has to be projected through the
 *    asset's own bbox to land in the right place. Assuming one or the other
 *    puts every detection in the wrong spot — and, worse, plausibly wrong.
 *
 * 2. **Zoom anchoring.** Zooming toward the viewport centre instead of the
 *    cursor makes inspecting a detection a chase. The transform below keeps
 *    the point under the pointer fixed across a scale change.
 *
 * Overlays live in a transformed layer alongside the image rather than being
 * painted into a canvas, so box strokes stay 1px at any zoom and each box
 * keeps its own hover/focus target.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE, API_PREFIX } from "@/lib/api/client";
import type { AssetMetadata, BoundingBox, Finding } from "@/lib/api/types";
import { cx, Pill } from "./primitives";

const MIN_SCALE = 0.2;
const MAX_SCALE = 12;

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

export function assetPreviewUrl(assetId: string, max = 1024): string {
  return `${API_BASE}${API_PREFIX}/assets/${assetId}/preview?max=${max}`;
}

/** A detection resolved to fractions of image width/height (0..1). */
interface PlacedBox {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
  confidence: number;
  findingId: string;
}

/**
 * Projects a box into 0..1 image space.
 *
 * Pixel-space boxes divide by the source raster dimensions. Georeferenced
 * boxes are placed relative to the asset's bbox, with the Y axis flipped —
 * northing increases upward, image rows increase downward.
 *
 * Returns null when the asset lacks the metadata needed to place the box,
 * which is the case the UI must show honestly rather than guess through.
 */
function placeBox(
  box: BoundingBox,
  asset: AssetMetadata,
): Omit<PlacedBox, "key" | "label" | "confidence" | "findingId"> | null {
  if (box.crs && asset.bbox) {
    const [minX, minY, maxX, maxY] = asset.bbox;
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    if (spanX <= 0 || spanY <= 0) return null;

    const left = (box.x_min - minX) / spanX;
    const right = (box.x_max - minX) / spanX;
    // Flip: bbox maxY is the top row of the image.
    const top = (maxY - box.y_max) / spanY;
    const bottom = (maxY - box.y_min) / spanY;

    return {
      left,
      top,
      width: Math.abs(right - left),
      height: Math.abs(bottom - top),
    };
  }

  // Pixel space.
  if (!asset.width || !asset.height) return null;
  return {
    left: box.x_min / asset.width,
    top: box.y_min / asset.height,
    width: (box.x_max - box.x_min) / asset.width,
    height: (box.y_max - box.y_min) / asset.height,
  };
}

export function collectBoxes(
  findings: Finding[],
  asset: AssetMetadata | null,
): { placed: PlacedBox[]; unplaceable: number } {
  if (!asset) return { placed: [], unplaceable: 0 };

  const placed: PlacedBox[] = [];
  let unplaceable = 0;

  findings.forEach((finding, findingIndex) => {
    finding.bounding_boxes?.forEach((box, boxIndex) => {
      const geometry = placeBox(box, asset);
      if (!geometry) {
        unplaceable += 1;
        return;
      }
      placed.push({
        ...geometry,
        key: `${finding.finding_id}-${boxIndex}`,
        findingId: finding.finding_id,
        label: finding.label ?? `Detection ${findingIndex + 1}`,
        confidence: finding.confidence,
      });
    });
  });

  return { placed, unplaceable };
}

interface ImageryViewerProps {
  asset: AssetMetadata | null;
  findings?: Finding[];
  /** Highlighted from the results list. */
  activeFindingId?: string | null;
  onSelectFinding?: (findingId: string) => void;
  className?: string;
  /**
   * Optional controlled framing. Compare lifts the transform so both
   * viewers share one — pan or zoom either side and the other follows,
   * which is what makes a before/after read as the same ground rather
   * than two loosely related pictures.
   */
  transform?: Transform;
  onTransformChange?: (next: Transform) => void;
}

export type { Transform as ViewerTransform };
export { IDENTITY as IDENTITY_TRANSFORM };

export default function ImageryViewer({
  asset,
  findings = [],
  activeFindingId = null,
  onSelectFinding,
  className,
  transform: controlledTransform,
  onTransformChange,
}: ImageryViewerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [uncontrolled, setUncontrolled] = useState<Transform>(IDENTITY);
  const isControlled = controlledTransform !== undefined;
  const transform = controlledTransform ?? uncontrolled;

  // One setter regardless of mode, so the interaction handlers below don't
  // each need to branch on whether a parent owns the framing.
  const setTransform = useCallback(
    (updater: Transform | ((current: Transform) => Transform)) => {
      if (controlledTransform !== undefined) {
        onTransformChange?.(
          typeof updater === "function" ? updater(controlledTransform) : updater,
        );
        return;
      }
      setUncontrolled((previous) =>
        typeof updater === "function" ? updater(previous) : updater,
      );
    },
    [controlledTransform, onTransformChange],
  );
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null,
  );

  /**
   * Reset load state (and, when uncontrolled, framing) as the asset changes.
   *
   * Adjusted during render rather than in an effect: an effect would paint
   * one frame of the new image using the old image's status and pan before
   * correcting itself. This is React's documented pattern for deriving state
   * from a changed prop.
   *
   * Controlled framing is deliberately left alone — Compare owns it, and a
   * user swapping one side of a before/after wants to keep the view they
   * were inspecting, not be thrown back to the top-left corner.
   */
  const [lastAssetId, setLastAssetId] = useState<string | null>(
    asset?.asset_id ?? null,
  );
  const currentAssetId = asset?.asset_id ?? null;
  if (currentAssetId !== lastAssetId) {
    setLastAssetId(currentAssetId);
    setStatus(asset ? "loading" : "idle");
    setErrorDetail(null);
    if (!isControlled) setUncontrolled(IDENTITY);
  }

  const zoomBy = useCallback((factor: number, originX: number, originY: number) => {
    setTransform((current) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
      if (next === current.scale) return current;
      // Keep the point under the cursor fixed: solve for the translation
      // that maps the same image point back to the same screen point.
      const ratio = next / current.scale;
      return {
        scale: next,
        x: originX - (originX - current.x) * ratio,
        y: originY - (originY - current.y) * ratio,
      };
    });
  }, [setTransform]);

  // Wheel zoom is registered non-passively so preventDefault actually stops
  // the page from scrolling behind the viewer. React's onWheel is passive.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      zoomBy(
        Math.exp(-event.deltaY * 0.0015),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };

    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      tx: transform.x,
      ty: transform.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setTransform((current) => ({
      ...current,
      x: drag.tx + (event.clientX - drag.x),
      y: drag.ty + (event.clientY - drag.y),
    }));
  };

  const endDrag = (event: React.PointerEvent) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const { placed, unplaceable } = collectBoxes(findings, asset);

  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-lg border border-[var(--rule-hairline)] bg-[var(--surface-sunken)]",
        className,
      )}
    >
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      >
        {asset ? (
          <div
            className="absolute left-0 top-0 origin-top-left will-change-transform"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            }}
          >
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- the
                  preview is generated per-asset by the API at a size we
                  request; next/image would add a second optimisation pass
                  over an already-downscaled PNG on a non-static origin. */}
              <img
                key={asset.asset_id}
                src={assetPreviewUrl(asset.asset_id)}
                alt={`Preview of ${asset.filename}`}
                draggable={false}
                onLoad={() => setStatus("ready")}
                onError={() => {
                  setStatus("error");
                  setErrorDetail(
                    "The API could not render a preview for this asset. It may not be a readable raster, or the file is missing from storage.",
                  );
                }}
                className="block max-w-none select-none"
                style={{ imageRendering: transform.scale > 2 ? "pixelated" : "auto" }}
              />

              {status === "ready"
                ? placed.map((box) => {
                    const isActive = box.findingId === activeFindingId;
                    return (
                      <button
                        key={box.key}
                        type="button"
                        onClick={() => onSelectFinding?.(box.findingId)}
                        title={`${box.label} · ${(box.confidence * 100).toFixed(0)}%`}
                        className={cx(
                          "absolute block cursor-pointer border-2 transition-colors",
                          isActive
                            ? "border-[var(--brand-rule)] bg-[var(--brand-rule-soft)]"
                            : "border-[color-mix(in_srgb,var(--brand-rule)_70%,transparent)] hover:border-[var(--brand-rule)]",
                        )}
                        style={{
                          left: `${box.left * 100}%`,
                          top: `${box.top * 100}%`,
                          width: `${box.width * 100}%`,
                          height: `${box.height * 100}%`,
                          // Counter-scale the stroke so it stays 1–2px on
                          // screen instead of thickening as you zoom in.
                          borderWidth: Math.max(1, 2 / transform.scale),
                        }}
                      />
                    );
                  })
                : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Overlay chrome ─────────────────────────────────────────────
          Only with an image behind it: zoom controls and a "No CRS
          recorded" readout floating over an empty panel look like a
          broken viewer rather than an idle one. */}

      <div
        hidden={!asset}
        className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex flex-col gap-1">
            <ZoomButton label="Zoom in" onClick={() => zoomBy(1.4, 0, 0)}>
              +
            </ZoomButton>
            <ZoomButton label="Zoom out" onClick={() => zoomBy(1 / 1.4, 0, 0)}>
              −
            </ZoomButton>
            <ZoomButton label="Reset view" onClick={() => setTransform(IDENTITY)}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
                <path
                  d="M4 9V5h4M20 15v4h-4M20 9V5h-4M4 15v4h4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </ZoomButton>
          </div>

          {placed.length > 0 ? (
            <Pill tone="active">
              {placed.length} region{placed.length === 1 ? "" : "s"}
              {unplaceable > 0 ? ` · ${unplaceable} unplaced` : ""}
            </Pill>
          ) : null}
        </div>

        <div className="flex items-end justify-between gap-2">
          <ViewerChip>
            {asset?.crs ?? "No CRS recorded"}
            {asset?.width && asset.height
              ? ` · ${asset.width}×${asset.height}`
              : ""}
          </ViewerChip>
          <ViewerChip>{(transform.scale * 100).toFixed(0)}%</ViewerChip>
        </div>
      </div>

      {status === "loading" && asset ? (
        <div className="absolute inset-0 grid place-items-center bg-[var(--surface-sunken)]">
          <span className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            Rendering preview…
          </span>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="absolute inset-0 grid place-items-center bg-[var(--surface-sunken)] px-8">
          <p className="max-w-sm text-center text-sm leading-relaxed text-[var(--ink-muted)]">
            {errorDetail}
          </p>
        </div>
      ) : null}

      {!asset ? (
        <div className="absolute inset-0 grid place-items-center px-8">
          <p className="text-center text-sm text-[var(--ink-muted)]">
            Select an image from the asset list to begin.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ZoomButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded border border-[var(--rule-hairline)] bg-[var(--surface)] text-sm text-[var(--ink-muted)] transition-colors hover:text-[var(--ink-primary)]"
    >
      {children}
    </button>
  );
}

function ViewerChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-[var(--rule-hairline)] bg-[var(--surface)]/90 px-2 py-1 font-[family-name:var(--font-geist-mono)] text-[10px] text-[var(--ink-muted)] backdrop-blur">
      {children}
    </span>
  );
}
