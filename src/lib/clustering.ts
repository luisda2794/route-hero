import type { EpodRow } from "./epod";

export type ZonePoint = {
  waybill: string;
  address: string;
  zip: string;
  lat: number;
  lon: number;
};

export type Zone = {
  id: number;
  name: string;
  points: ZonePoint[];
};

export type ClusterResult = {
  zones: Zone[];
  unlocated: EpodRow[];
};

/** Distinct, high-contrast colors — enough for up to 12 driver zones. */
export const ZONE_COLORS = [
  "#e6194b",
  "#3cb44b",
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#42d4f4",
  "#f032e6",
  "#bfef45",
  "#469990",
  "#9a6324",
  "#000075",
  "#f5c518",
];

const EARTH_RADIUS_KM = 6371;
const MAX_ITERATIONS = 50;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in km between two lat/lon points. */
export function haversineDistance(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

type Centroid = { lat: number; lon: number };

/**
 * Simple K-means over lat/lon points using haversine distance.
 * Returns up to `k` clusters (fewer if there aren't enough points).
 */
export function kmeans(points: ZonePoint[], k: number, maxIterations = MAX_ITERATIONS): ZonePoint[][] {
  if (points.length === 0 || k <= 0) return [];
  const clampedK = Math.min(k, points.length);

  const shuffled = [...points].sort(() => Math.random() - 0.5);
  let centroids: Centroid[] = shuffled.slice(0, clampedK).map((p) => ({ lat: p.lat, lon: p.lon }));
  let assignments: number[] = new Array(points.length).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    const newAssignments = points.map((point) => {
      let bestIdx = 0;
      let bestDist = Infinity;
      centroids.forEach((centroid, idx) => {
        const dist = haversineDistance(point, centroid);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });
      return bestIdx;
    });

    const changed = newAssignments.some((a, i) => a !== assignments[i]);
    assignments = newAssignments;
    if (!changed && iter > 0) break;

    const sums = centroids.map(() => ({ lat: 0, lon: 0, count: 0 }));
    points.forEach((point, i) => {
      const idx = assignments[i]!;
      const sum = sums[idx]!;
      sum.lat += point.lat;
      sum.lon += point.lon;
      sum.count += 1;
    });

    centroids = centroids.map((centroid, idx) => {
      const sum = sums[idx]!;
      if (sum.count === 0) return centroid; // no points assigned this round — keep it in place
      return { lat: sum.lat / sum.count, lon: sum.lon / sum.count };
    });
  }

  const clusters: ZonePoint[][] = Array.from({ length: clampedK }, () => []);
  points.forEach((point, i) => {
    const idx = assignments[i]!;
    clusters[idx]!.push(point);
  });
  return clusters;
}

/**
 * Splits in-delivery rows into geolocated / unlocated, then clusters the
 * geolocated ones into `driverCount` zones by real proximity (K-means).
 */
export function buildZones(rows: EpodRow[], driverCount: number): ClusterResult {
  const located: ZonePoint[] = [];
  const unlocated: EpodRow[] = [];

  for (const row of rows) {
    if (row.lat !== null && row.lon !== null) {
      located.push({ waybill: row.waybill, address: row.address, zip: row.zip, lat: row.lat, lon: row.lon });
    } else {
      unlocated.push(row);
    }
  }

  const clusters = kmeans(located, driverCount);
  const zones: Zone[] = clusters.map((points, idx) => ({
    id: idx,
    name: `Conductor ${idx + 1}`,
    points,
  }));

  return { zones, unlocated };
}
