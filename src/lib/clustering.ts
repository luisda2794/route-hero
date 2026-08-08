import { NO_ZIP_LABEL, type EpodRow } from "./epod";

export type ZonePoint = {
  waybill: string;
  address: string;
  zip: string;
  lat: number;
  lon: number;
};

/** A zone point with its visiting order within the route (1-based). */
export type RoutedPoint = ZonePoint & { stopNumber: number };

export type Zone = {
  id: string;
  zip: string;
  /** Sequential across the whole day — never resets per CP. */
  driverNumber: number;
  name: string;
  points: RoutedPoint[];
};

/** One CP's worth of zones, clustered independently from every other CP. */
export type ZipGroup = {
  zip: string;
  totalPackages: number;
  targetSize: number;
  zones: Zone[];
};

export type MultiZipClusterResult = {
  groups: ZipGroup[];
  unlocated: EpodRow[];
};

/** How far a zone may drift above/below the target size before it's rebalanced. */
export const BALANCE_MARGIN_RATIO = 0.3;

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
 * Assigns each point to the nearest centroid that still has room under
 * `maxCapacity`, falling back to the next-nearest with room, and so on.
 * Points that are farthest from any centroid (the most "ambiguous" ones)
 * are placed first, since they have the least flexibility later on.
 */
function assignWithCapacity(points: ZonePoint[], centroids: Centroid[], maxCapacity: number): number[] {
  const k = centroids.length;
  const distances = points.map((point) => centroids.map((centroid) => haversineDistance(point, centroid)));

  const order = points
    .map((_, i) => i)
    .sort((a, b) => Math.min(...distances[b]!) - Math.min(...distances[a]!));

  const counts: number[] = new Array(k).fill(0);
  const assignments: number[] = new Array(points.length).fill(-1);

  for (const i of order) {
    const centroidOrder = distances[i]!
      .map((_, c) => c)
      .sort((a, b) => distances[i]![a]! - distances[i]![b]!);

    const availableCentroid = centroidOrder.find((c) => counts[c]! < maxCapacity);
    const chosen = availableCentroid ?? centroidOrder[0]!;
    assignments[i] = chosen;
    counts[chosen] = counts[chosen]! + 1;
  }

  return assignments;
}

/**
 * K-means over lat/lon points using haversine distance, with a capacity
 * constraint applied on every iteration so no zone drifts too far above
 * (or below) the target size while centroids still converge geographically.
 * Returns up to `k` clusters (fewer if there aren't enough points).
 */
export function kmeans(points: ZonePoint[], k: number, maxIterations = MAX_ITERATIONS): ZonePoint[][] {
  if (points.length === 0 || k <= 0) return [];
  const clampedK = Math.min(k, points.length);

  const shuffled = [...points].sort(() => Math.random() - 0.5);
  let centroids: Centroid[] = shuffled.slice(0, clampedK).map((p) => ({ lat: p.lat, lon: p.lon }));
  let assignments: number[] = new Array(points.length).fill(-1);

  const targetSize = points.length / clampedK;
  const maxCapacity = Math.max(1, Math.ceil(targetSize * (1 + BALANCE_MARGIN_RATIO)));

  for (let iter = 0; iter < maxIterations; iter++) {
    const newAssignments = assignWithCapacity(points, centroids, maxCapacity);

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
 * Orders a zone's points into a route: starts at the point farthest from the
 * zone's centroid (the route's natural "far end"), then repeatedly hops to
 * the nearest unvisited point (nearest-neighbor heuristic).
 */
function orderStopsNearestNeighbor(points: ZonePoint[]): RoutedPoint[] {
  if (points.length === 0) return [];

  const centroid = {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length,
  };

  let startIdx = 0;
  let maxDist = -Infinity;
  points.forEach((p, i) => {
    const d = haversineDistance(p, centroid);
    if (d > maxDist) {
      maxDist = d;
      startIdx = i;
    }
  });

  const visited = new Array<boolean>(points.length).fill(false);
  visited[startIdx] = true;
  const order: number[] = [startIdx];
  let currentIdx = startIdx;

  for (let step = 1; step < points.length; step++) {
    let nearestIdx = -1;
    let nearestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      if (visited[i]) continue;
      const d = haversineDistance(points[currentIdx]!, points[i]!);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    order.push(nearestIdx);
    visited[nearestIdx] = true;
    currentIdx = nearestIdx;
  }

  return order.map((idx, stop) => ({ ...points[idx]!, stopNumber: stop + 1 }));
}

function splitByCoords(rows: EpodRow[]): { located: ZonePoint[]; unlocated: EpodRow[] } {
  const located: ZonePoint[] = [];
  const unlocated: EpodRow[] = [];
  for (const row of rows) {
    if (row.lat !== null && row.lon !== null) {
      located.push({ waybill: row.waybill, address: row.address, zip: row.zip, lat: row.lat, lon: row.lon });
    } else {
      unlocated.push(row);
    }
  }
  return { located, unlocated };
}

/**
 * Clusters a single CP's rows into `driverCount` zones and orders each
 * zone's stops by nearest-neighbor. Always returns `driverCount` zones even
 * if some end up with very few — or zero — packages, e.g. when a CP has
 * fewer packages than drivers requested. `driverNumber`/`name` are left as
 * placeholders here — `buildZonesByZip` assigns the final, globally unique
 * driver number and name once every CP's zones are known.
 */
export function buildZonesForZip(
  rows: EpodRow[],
  zip: string,
  driverCount: number,
): { group: ZipGroup; unlocated: EpodRow[] } {
  const { located, unlocated } = splitByCoords(rows);
  const clusters = kmeans(located, driverCount);

  const zones: Zone[] = clusters.map((points, idx) => ({
    id: `${zip}__${idx}`,
    zip,
    driverNumber: 0,
    name: "",
    points: orderStopsNearestNeighbor(points),
  }));
  for (let idx = zones.length; idx < driverCount; idx++) {
    zones.push({ id: `${zip}__${idx}`, zip, driverNumber: 0, name: "", points: [] });
  }

  const targetSize = driverCount > 0 ? Math.round(located.length / driverCount) : 0;

  return {
    group: { zip, totalPackages: rows.length, targetSize, zones },
    unlocated,
  };
}

/**
 * Groups in-delivery rows by CP, then clusters each CP independently using
 * its own driver count — packages from one CP never end up in another CP's
 * zone. CPs left blank or at 0 drivers are skipped entirely (no zones).
 * Driver numbers are assigned once, sequentially, across every CP's zones
 * (in the same highest-to-lowest-volume order the zones are returned in) —
 * never resetting per CP.
 */
export function buildZonesByZip(
  rows: EpodRow[],
  driverCountByZip: Record<string, number>,
): MultiZipClusterResult {
  const rowsByZip = new Map<string, EpodRow[]>();
  for (const row of rows) {
    const key = row.zip || NO_ZIP_LABEL;
    const bucket = rowsByZip.get(key);
    if (bucket) bucket.push(row);
    else rowsByZip.set(key, [row]);
  }

  const groups: ZipGroup[] = [];
  const unlocated: EpodRow[] = [];

  for (const [zip, zipRows] of rowsByZip) {
    const driverCount = driverCountByZip[zip] ?? 0;
    if (driverCount <= 0) continue;
    const { group, unlocated: zipUnlocated } = buildZonesForZip(zipRows, zip, driverCount);
    groups.push(group);
    unlocated.push(...zipUnlocated);
  }

  groups.sort((a, b) => b.totalPackages - a.totalPackages);

  let globalDriverNumber = 1;
  for (const group of groups) {
    for (const zone of group.zones) {
      zone.driverNumber = globalDriverNumber;
      zone.name = `Conductor ${globalDriverNumber} — CP ${group.zip}`;
      globalDriverNumber += 1;
    }
  }

  return { groups, unlocated };
}

/**
 * Distinct hue per CP (golden-angle spacing keeps hues well spread no matter
 * how many CPs there are), distinct lightness per zone within that CP — so
 * zones from the same CP read as a family of tones at a glance.
 */
export function assignZoneColors(groups: ZipGroup[]): Record<string, string> {
  const colors: Record<string, string> = {};
  groups.forEach((group, groupIdx) => {
    const hue = (groupIdx * 137.508) % 360;
    const zonesInGroup = group.zones.length;
    group.zones.forEach((zone, zoneIdx) => {
      const lightness = zonesInGroup <= 1 ? 48 : 36 + (zoneIdx / (zonesInGroup - 1)) * 26;
      colors[zone.id] = `hsl(${hue.toFixed(1)} 72% ${lightness.toFixed(1)}%)`;
    });
  });
  return colors;
}
