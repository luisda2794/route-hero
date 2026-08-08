import { NO_ZIP_LABEL, isPudoDelivery, type EpodRow } from "./epod";

export type ZonePoint = {
  waybill: string;
  address: string;
  zip: string;
  lat: number;
  lon: number;
};

/** A zone point with its visiting order within the route (1-based). */
export type RoutedPoint = ZonePoint & { stopNumber: number };

/** Andarín = on foot, needs stops close together. Repartidor = vehicle, no distance limit. */
export type DriverType = "andarin" | "repartidor";

export type Zone = {
  id: string;
  /** Real CP for a home zone; the constant `PUDO_LABEL` for a PUDO zone (its packages span every CP). */
  zip: string;
  kind: "home" | "pudo";
  driverType: DriverType;
  /** True if this zone is one of several produced by auto-splitting a zone that had more than `MAX_AREA_SIZE` packages. */
  splitBySize: boolean;
  /** True if this zone is one of several produced by auto-splitting an Andarín zone that was too spread out. */
  splitByDistance: boolean;
  /** Sequential across the whole day — never resets per CP, and PUDO zones continue after every home zone. */
  driverNumber: number;
  name: string;
  points: RoutedPoint[];
};

/** One CP's worth of home-delivery zones, or the single consolidated PUDO route. */
export type ZipGroup = {
  zip: string;
  totalPackages: number;
  zones: Zone[];
};

export type MultiZipClusterResult = {
  groups: ZipGroup[];
  /** The consolidated PUDO route (all CPs pooled together), or null if not requested. */
  pudoGroup: ZipGroup | null;
  unlocated: EpodRow[];
  /** How many extra zones were created beyond what was configured, from auto-splitting (size cap or Andarín distance). */
  extraSplitZones: number;
};

/** Synthetic "CP" label used for the consolidated PUDO route. */
export const PUDO_LABEL = "PUDO";

/** An Andarín's route may never have two consecutive stops farther apart than this. */
export const WALK_MAX_STOP_DISTANCE_KM = 0.8;

/** No single area — home or PUDO, any driver type — should end up with more packages than this. */
export const MAX_AREA_SIZE = 40;

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
 * Assigns each point to its single nearest centroid — plain, unconstrained
 * nearest-centroid assignment (no capacity/balance adjustment).
 */
function assignNearest(points: ZonePoint[], centroids: Centroid[]): number[] {
  return points.map((point) => {
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
}

/**
 * Plain K-means over lat/lon points using haversine distance (Lloyd's
 * algorithm, no capacity/balance constraint) — this is what keeps areas
 * geographically compact instead of mixing nearby points across zones to
 * even out package counts. Returns up to `k` clusters (fewer if there
 * aren't enough points).
 */
export function kmeans(points: ZonePoint[], k: number, maxIterations = MAX_ITERATIONS): ZonePoint[][] {
  if (points.length === 0 || k <= 0) return [];
  const clampedK = Math.min(k, points.length);

  const shuffled = [...points].sort(() => Math.random() - 0.5);
  let centroids: Centroid[] = shuffled.slice(0, clampedK).map((p) => ({ lat: p.lat, lon: p.lon }));
  let assignments: number[] = new Array(points.length).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    const newAssignments = assignNearest(points, centroids);

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

/**
 * Splits an Andarín zone wherever two consecutive stops (in the already
 * nearest-neighbor-ordered route) are farther apart than
 * `WALK_MAX_STOP_DISTANCE_KM`. Since the route is a single ordered sequence,
 * cutting at every such gap in one pass already guarantees no resulting
 * sub-zone has an internal gap over the limit — no further passes needed.
 * Returns `[zone]` unchanged if no gap exceeds the limit.
 */
function splitAndarinZone(zone: Zone): Zone[] {
  if (zone.points.length <= 1) return [zone];

  const segments: RoutedPoint[][] = [];
  let current: RoutedPoint[] = [zone.points[0]!];
  for (let i = 1; i < zone.points.length; i++) {
    const dist = haversineDistance(zone.points[i - 1]!, zone.points[i]!);
    if (dist > WALK_MAX_STOP_DISTANCE_KM) {
      segments.push(current);
      current = [];
    }
    current.push(zone.points[i]!);
  }
  segments.push(current);

  if (segments.length <= 1) return [zone];

  return segments.map((points, idx) => ({
    ...zone,
    id: `${zone.id}__split${idx}`,
    splitByDistance: true,
    points: points.map((p, i) => ({ ...p, stopNumber: i + 1 })),
  }));
}

/**
 * Assigns each point to the nearest centroid that still has room under
 * `maxCapacity`, falling back to the next-nearest with room, and so on.
 * Points farthest from any centroid are placed first, since they have the
 * least flexibility later. Used only by `kmeansCapacitated`, to subdivide a
 * single already-decided zone — never to mix points across different zones.
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
 * Same Lloyd's-algorithm loop as `kmeans`, but every iteration's assignment
 * is hard-capped at `maxCapacity` per cluster. With `k = ceil(n / maxCapacity)`
 * a valid capped assignment always exists, so this *guarantees* every
 * resulting cluster has at most `maxCapacity` points — no recursion needed.
 */
function kmeansCapacitated(
  points: ZonePoint[],
  k: number,
  maxCapacity: number,
  maxIterations = MAX_ITERATIONS,
): ZonePoint[][] {
  if (points.length === 0 || k <= 0) return [];
  const clampedK = Math.min(k, points.length);

  const shuffled = [...points].sort(() => Math.random() - 0.5);
  let centroids: Centroid[] = shuffled.slice(0, clampedK).map((p) => ({ lat: p.lat, lon: p.lon }));
  let assignments: number[] = new Array(points.length).fill(-1);

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
      if (sum.count === 0) return centroid;
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
 * Re-clusters a zone that ended up with more than `maxSize` packages into
 * smaller, still-geographically-compact sub-zones — capped in a single pass
 * (see `kmeansCapacitated`), operating only on this zone's own points, never
 * touching any other zone. Returns `[zone]` unchanged if already within cap.
 */
function splitOversizedZone(zone: Zone, maxSize: number): Zone[] {
  if (zone.points.length <= maxSize) return [zone];

  const subK = Math.ceil(zone.points.length / maxSize);
  const subClusters = kmeansCapacitated(zone.points, subK, maxSize);

  return subClusters
    .filter((points) => points.length > 0)
    .map((points, idx) => ({
      ...zone,
      id: `${zone.id}__cap${idx}`,
      splitBySize: true,
      points: orderStopsNearestNeighbor(points),
    }));
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
 * Clusters `rows` into `driverCount` zones and orders each zone's stops by
 * nearest-neighbor. Always returns `driverCount` zones even if some end up
 * with very few — or zero — packages. `driverNumber`/`name` are left as
 * placeholders — `buildZonesByZip` assigns the final, globally unique driver
 * number and name once every group's zones are known.
 */
function clusterIntoZones(
  rows: EpodRow[],
  driverCount: number,
  idPrefix: string,
  zip: string,
  kind: Zone["kind"],
): { zones: Zone[]; totalPackages: number; unlocated: EpodRow[] } {
  const { located, unlocated } = splitByCoords(rows);
  const clusters = kmeans(located, driverCount);

  const zones: Zone[] = clusters.map((points, idx) => ({
    id: `${idPrefix}__${idx}`,
    zip,
    kind,
    driverType: "repartidor",
    splitBySize: false,
    splitByDistance: false,
    driverNumber: 0,
    name: "",
    points: orderStopsNearestNeighbor(points),
  }));
  for (let idx = zones.length; idx < driverCount; idx++) {
    zones.push({
      id: `${idPrefix}__${idx}`,
      zip,
      kind,
      driverType: "repartidor",
      splitBySize: false,
      splitByDistance: false,
      driverNumber: 0,
      name: "",
      points: [],
    });
  }

  return { zones, totalPackages: rows.length, unlocated };
}

/**
 * Clusters a single CP's home-delivery rows into zones, one per entry in
 * `types` (in slot order). Any zone over `MAX_AREA_SIZE` packages gets
 * re-clustered into smaller ones, and Andarín zones whose route has a gap
 * over `WALK_MAX_STOP_DISTANCE_KM` between consecutive stops get further
 * split — so the final zone count can exceed `types.length`.
 */
export function buildZonesForZip(
  rows: EpodRow[],
  zip: string,
  types: DriverType[],
): { group: ZipGroup; unlocated: EpodRow[]; extraZones: number } {
  const driverCount = types.length;
  const { zones, totalPackages, unlocated } = clusterIntoZones(rows, driverCount, zip, zip, "home");

  const typedZones: Zone[] = zones.map((zone, i) => ({ ...zone, driverType: types[i] ?? "repartidor" }));
  const sizeCappedZones: Zone[] = typedZones.flatMap((zone) => splitOversizedZone(zone, MAX_AREA_SIZE));
  const finalZones: Zone[] = sizeCappedZones.flatMap((zone) =>
    zone.driverType === "andarin" ? splitAndarinZone(zone) : [zone],
  );

  return {
    group: { zip, totalPackages, zones: finalZones },
    unlocated,
    extraZones: finalZones.length - driverCount,
  };
}

/**
 * Clusters PUDO rows pooled from every CP into `driverCount` zones — a
 * consolidated route, never mixed with the per-CP home-delivery zones. Any
 * zone over `MAX_AREA_SIZE` packages gets re-clustered into smaller ones.
 */
export function buildPudoZones(
  rows: EpodRow[],
  driverCount: number,
): { group: ZipGroup; unlocated: EpodRow[]; extraZones: number } {
  const { zones, totalPackages, unlocated } = clusterIntoZones(rows, driverCount, "pudo", PUDO_LABEL, "pudo");
  const finalZones: Zone[] = zones.flatMap((zone) => splitOversizedZone(zone, MAX_AREA_SIZE));
  return {
    group: { zip: PUDO_LABEL, totalPackages, zones: finalZones },
    unlocated,
    extraZones: finalZones.length - driverCount,
  };
}

/**
 * Groups in-delivery rows by CP, then clusters each CP's home deliveries
 * independently using its own driver count — packages from one CP never end
 * up in another CP's zone. CPs left blank or at 0 drivers are skipped
 * entirely (no zones). PUDO rows from every CP are pooled and, if
 * `pudoDriverCount` is set, clustered into their own consolidated route.
 *
 * Driver numbers are assigned once, sequentially: every home zone first (in
 * highest-to-lowest CP volume order), then every PUDO zone — continuing the
 * same count rather than resetting.
 */
export function buildZonesByZip(
  rows: EpodRow[],
  driverTypesByZip: Record<string, DriverType[]>,
  pudoDriverCount = 0,
): MultiZipClusterResult {
  const homeRows = rows.filter((r) => !isPudoDelivery(r.deliveryType));
  const pudoRows = rows.filter((r) => isPudoDelivery(r.deliveryType));

  const rowsByZip = new Map<string, EpodRow[]>();
  for (const row of homeRows) {
    const key = row.zip || NO_ZIP_LABEL;
    const bucket = rowsByZip.get(key);
    if (bucket) bucket.push(row);
    else rowsByZip.set(key, [row]);
  }

  const groups: ZipGroup[] = [];
  const unlocated: EpodRow[] = [];
  let extraSplitZones = 0;

  for (const [zip, zipRows] of rowsByZip) {
    const types = driverTypesByZip[zip] ?? [];
    if (types.length <= 0) continue;
    const { group, unlocated: zipUnlocated, extraZones } = buildZonesForZip(zipRows, zip, types);
    groups.push(group);
    unlocated.push(...zipUnlocated);
    extraSplitZones += extraZones;
  }

  groups.sort((a, b) => b.totalPackages - a.totalPackages);

  let pudoGroup: ZipGroup | null = null;
  if (pudoDriverCount > 0 && pudoRows.length > 0) {
    const { group, unlocated: pudoUnlocated, extraZones } = buildPudoZones(pudoRows, pudoDriverCount);
    pudoGroup = group;
    unlocated.push(...pudoUnlocated);
    extraSplitZones += extraZones;
  }

  let globalDriverNumber = 1;
  for (const group of groups) {
    for (const zone of group.zones) {
      zone.driverNumber = globalDriverNumber;
      zone.name = `Conductor ${globalDriverNumber} — CP ${group.zip}`;
      globalDriverNumber += 1;
    }
  }
  if (pudoGroup) {
    for (const zone of pudoGroup.zones) {
      zone.driverNumber = globalDriverNumber;
      zone.name = `Conductor ${globalDriverNumber} — Ruta PUDO`;
      globalDriverNumber += 1;
    }
  }

  return { groups, pudoGroup, unlocated, extraSplitZones };
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
