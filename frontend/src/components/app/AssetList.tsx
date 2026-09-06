"use client";

/**
 * Selectable list of ingested imagery, used as the Analyze sidebar and as
 * the picker on Compare.
 */

import type { AssetMetadata, ImageModality } from "@/lib/api/types";
import { cx, Shimmer } from "./primitives";

const MODALITY_LABEL: Record<ImageModality, string> = {
  optical: "Optical",
  sar: "SAR",
  multispectral: "Multispectral",
  hyperspectral: "Hyperspectral",
  unknown: "Unclassified",
};

/**
 * `_detect_modality` on the backend is filename heuristics, so "unknown" is
 * common and doesn't mean the file is bad. Worth distinguishing visually
 * from a confirmed modality without treating it as an error.
 */
export function AssetRow({
  asset,
  selected,
  disabled,
  onSelect,
  badge,
}: {
  asset: AssetMetadata;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  badge?: React.ReactNode;
}) {
  const acquired = asset.acquisition_time
    ? new Date(asset.acquisition_time).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        "w-full rounded-md border px-3 py-3 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-deep)]",
        selected
          ? "border-[var(--brand-deep)] bg-[color-mix(in_srgb,var(--brand-deep)_6%,transparent)]"
          : "border-[var(--rule-hairline)] bg-[var(--surface)] hover:border-[var(--rule-strong)]",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--ink-primary)]">
            {asset.filename}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">
            {MODALITY_LABEL[asset.modality]}
            {acquired ? ` · ${acquired}` : ""}
          </span>
        </span>
        {badge}
      </div>
    </button>
  );
}

export default function AssetList({
  assets,
  isLoading,
  selectedId,
  onSelect,
  emptyHint,
}: {
  assets: AssetMetadata[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (assetId: string) => void;
  emptyHint?: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Shimmer className="h-16 w-full" />
        <Shimmer className="h-16 w-full" />
        <Shimmer className="h-16 w-full" />
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-[var(--rule-strong)] px-3 py-6 text-center text-sm leading-relaxed text-[var(--ink-muted)]">
        {emptyHint ?? "No imagery ingested yet."}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {assets.map((asset) => (
        <li key={asset.asset_id}>
          <AssetRow
            asset={asset}
            selected={asset.asset_id === selectedId}
            onSelect={() => onSelect(asset.asset_id)}
          />
        </li>
      ))}
    </ul>
  );
}
