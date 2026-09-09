"use client";

import * as THREE from "three";

/**
 * Geography helpers for the "fly to a place" globe interaction.
 *
 * Two jobs: turn a place name into a latitude/longitude, and turn a
 * latitude/longitude into a point on the unit sphere that matches how the
 * Earth texture is wrapped in Earth.tsx.
 */

export interface GeoPlace {
  name: string;
  lat: number;
  lon: number;
  /** Country name, when the geocoder supplies one — used only for the label. */
  country?: string;
  /** State/region, when supplied — disambiguates same-named cities. */
  admin1?: string;
}

const DEG = Math.PI / 180;

/**
 * Point on the unit sphere for a latitude/longitude.
 *
 * This has to match the exact UV wrapping Earth.tsx uses, which is the
 * default three.js SphereGeometry mapping sampled by an equirectangular
 * plate (u = 0 at −180° longitude increasing east, v = 0 at the north
 * pole). Derived from that mapping:
 *
 *   polar angle from +Y  φ = (90 − lat)°
 *   azimuth              θ = (lon + 180)°
 *   x = −cos θ · sin φ,  y = cos φ,  z = sin θ · sin φ
 *
 * A quick check: (lat 0, lon −90) lands on +Z, which is the face that
 * points toward the camera at rest — so a place there needs no turn.
 */
export function latLonToVector3(lat: number, lon: number, radius = 1): THREE.Vector3 {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return new THREE.Vector3(
    -radius * Math.cos(theta) * Math.sin(phi),
    radius * Math.cos(phi),
    radius * Math.sin(theta) * Math.sin(phi),
  );
}

/**
 * A small offline gazetteer. The live geocoder covers essentially every
 * place, but a demo shouldn't hard-fail when the network blips or the
 * laptop is offline, so a handful of well-known locations resolve without
 * it. Also used as an instant answer before the network call returns.
 */
const FALLBACK_PLACES: GeoPlace[] = [
  { name: "New Delhi", lat: 28.6139, lon: 77.209, country: "India" },
  { name: "Mumbai", lat: 19.076, lon: 72.8777, country: "India" },
  { name: "Bengaluru", lat: 12.9716, lon: 77.5946, country: "India" },
  { name: "Chennai", lat: 13.0827, lon: 80.2707, country: "India" },
  { name: "Kolkata", lat: 22.5726, lon: 88.3639, country: "India" },
  { name: "Hyderabad", lat: 17.385, lon: 78.4867, country: "India" },
  { name: "Sriharikota", lat: 13.72, lon: 80.23, country: "India" },
  { name: "London", lat: 51.5074, lon: -0.1278, country: "United Kingdom" },
  { name: "Paris", lat: 48.8566, lon: 2.3522, country: "France" },
  { name: "New York", lat: 40.7128, lon: -74.006, country: "United States" },
  { name: "San Francisco", lat: 37.7749, lon: -122.4194, country: "United States" },
  { name: "Tokyo", lat: 35.6762, lon: 139.6503, country: "Japan" },
  { name: "Beijing", lat: 39.9042, lon: 116.4074, country: "China" },
  { name: "Sydney", lat: -33.8688, lon: 151.2093, country: "Australia" },
  { name: "Cairo", lat: 30.0444, lon: 31.2357, country: "Egypt" },
  { name: "Dubai", lat: 25.2048, lon: 55.2708, country: "UAE" },
  { name: "Singapore", lat: 1.3521, lon: 103.8198, country: "Singapore" },
  { name: "Moscow", lat: 55.7558, lon: 37.6173, country: "Russia" },
  { name: "Rio de Janeiro", lat: -22.9068, lon: -43.1729, country: "Brazil" },
  { name: "Amazon Rainforest", lat: -3.4653, lon: -62.2159, country: "Brazil" },
  { name: "Sahara Desert", lat: 23.4162, lon: 25.6628 },
  { name: "Himalayas", lat: 27.9881, lon: 86.925 },
  { name: "Great Barrier Reef", lat: -18.2871, lon: 147.6992, country: "Australia" },
];

function matchFallback(query: string): GeoPlace | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = FALLBACK_PLACES.find((p) => p.name.toLowerCase() === q);
  if (exact) return exact;
  return FALLBACK_PLACES.find((p) => p.name.toLowerCase().startsWith(q)) ?? null;
}

/** Open-Meteo geocoding response, trimmed to the fields we read. */
interface OpenMeteoResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

/**
 * Resolve a place name to coordinates.
 *
 * Uses Open-Meteo's geocoding API: free, keyless, CORS-enabled, so it runs
 * straight from the browser with no backend involvement. Any failure —
 * offline, rate-limited, no match — falls back to the built-in gazetteer so
 * the interaction still does something sensible rather than dead-ending.
 */
export async function geocodePlace(
  query: string,
  signal?: AbortSignal,
): Promise<GeoPlace | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
      encodeURIComponent(trimmed);
    const res = await fetch(url, { signal });
    if (res.ok) {
      const data = (await res.json()) as { results?: OpenMeteoResult[] };
      const hit = data.results?.[0];
      if (hit && Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude)) {
        return {
          name: hit.name,
          lat: hit.latitude,
          lon: hit.longitude,
          country: hit.country,
          admin1: hit.admin1,
        };
      }
    }
  } catch {
    // Network/abort — fall through to the offline list.
  }

  return matchFallback(trimmed);
}

/** A human label for a resolved place: "City, Region, Country" as available. */
export function placeLabel(place: GeoPlace): string {
  return [place.name, place.admin1, place.country].filter(Boolean).join(", ");
}
