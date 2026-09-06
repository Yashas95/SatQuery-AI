"use client";

/**
 * Datasets — the image catalogue.
 *
 * Everything here is read from `GET /assets`. There are no seeded example
 * collections: a catalogue that lists imagery the backend doesn't hold sends
 * the user to Analyze to find an empty workspace, and during a demo that
 * reads as the system being broken rather than as the data not being loaded.
 * An empty catalogue says so, and says how to fill it.
 */

import { useRouter } from "next/navigation";
import { useRef } from "react";

import {
  Button,
  DataRow,
  EmptyState,
  ErrorNotice,
  Eyebrow,
  Panel,
  Pill,
  Shimmer,
} from "@/components/app/primitives";
import { useAssets } from "@/hooks/useAssets";
import type { AssetMetadata, ImageModality } from "@/lib/api/types";

const MODALITY_COPY: Record<ImageModality, string> = {
  optical: "Optical imagery",
  sar: "Synthetic-aperture radar",
  multispectral: "Multispectral",
  hyperspectral: "Hyperspectral",
  unknown: "Modality not detected",
};

export default function DatasetsPage() {
  const router = useRouter();
  const {
    assets,
    total,
    isLoading,
    error,
    isUploading,
    uploadError,
    upload,
    remove,
  } = useAssets();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <Eyebrow>Image catalogue</Eyebrow>
          <h1 className="font-[family-name:var(--font-serif-display)] text-[2rem] leading-tight text-[var(--ink-primary)]">
            Available Datasets
          </h1>
          <p className="text-sm text-[var(--ink-muted)]">
            {isLoading
              ? "Loading catalogue…"
              : `${total} asset${total === 1 ? "" : "s"} ingested`}
          </p>
        </div>

        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? "Ingesting…" : "Ingest imagery"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept=".tif,.tiff,.jp2,.img,.nc,.png,.jpg,.jpeg"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) await upload(file);
          }}
        />
      </header>

      {error ? <ErrorNotice>{error}</ErrorNotice> : null}
      {uploadError ? <ErrorNotice>{uploadError}</ErrorNotice> : null}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Shimmer className="h-52" />
          <Shimmer className="h-52" />
          <Shimmer className="h-52" />
        </div>
      ) : assets.length === 0 && !error ? (
        <EmptyState
          title="No imagery ingested yet"
          hint="Upload a GeoTIFF, JPEG2000 or NetCDF scene, or drop files directly into the backend's data/raw directory and restart the API to register them."
          action={
            <Button onClick={() => fileInputRef.current?.click()}>
              Ingest imagery
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <DatasetCard
              key={asset.asset_id}
              asset={asset}
              onAnalyze={() =>
                router.push(`/analyze?asset=${encodeURIComponent(asset.asset_id)}`)
              }
              onRemove={() => void remove(asset.asset_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DatasetCard({
  asset,
  onAnalyze,
  onRemove,
}: {
  asset: AssetMetadata;
  onAnalyze: () => void;
  onRemove: () => void;
}) {
  const acquired = asset.acquisition_time
    ? new Date(asset.acquisition_time).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <Panel className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--surface-sunken)] text-[var(--brand-deep)]">
          <ModalityIcon modality={asset.modality} />
        </span>
        <Pill tone={asset.modality === "unknown" ? "warn" : "neutral"}>
          {asset.modality.toUpperCase()}
        </Pill>
      </div>

      <h2
        className="mt-4 truncate font-[family-name:var(--font-serif-display)] text-lg text-[var(--ink-primary)]"
        title={asset.filename}
      >
        {asset.filename}
      </h2>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        {MODALITY_COPY[asset.modality]}
        {acquired ? ` · ${acquired}` : ""}
      </p>

      <dl className="mt-3 divide-y divide-[var(--rule-hairline)] border-t border-[var(--rule-hairline)]">
        <DataRow
          label="Dimensions"
          value={
            asset.width && asset.height
              ? `${asset.width} × ${asset.height}`
              : "Not read"
          }
          mono
        />
        <DataRow label="Bands" value={asset.band_count ?? "—"} mono />
        <DataRow label="CRS" value={asset.crs ?? "Not georeferenced"} mono />
      </dl>

      <div className="mt-4 flex gap-2 pt-1">
        <Button className="flex-1" onClick={onAnalyze}>
          Use in analysis
        </Button>
        <Button
          variant="ghost"
          aria-label={`Remove ${asset.filename}`}
          onClick={onRemove}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
            <path
              d="M5 7h14M10 7V5h4v2m-7 0 .8 12a1 1 0 0 0 1 1h6.4a1 1 0 0 0 1-1L17 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
      </div>
    </Panel>
  );
}

function ModalityIcon({ modality }: { modality: ImageModality }) {
  if (modality === "sar") {
    // Concentric arcs — an active sensor emitting, not a passive lens.
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M5 19a9 9 0 0 1 9-9m-9 9a5 5 0 0 1 5-5m-5 5h.01M14 5a14 14 0 0 1 5 5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="m4 16 4.5-4.5 3 3L15 11l5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
