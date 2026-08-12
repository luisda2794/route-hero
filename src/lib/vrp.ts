import { haversineDistance } from "./geo-math";
import type { DriverType, RoutedPoint, ZonePoint } from "./clustering";

export type VrpSettings = {
  /** Minutes spent at each stop (handoff/loading), same for every driver. */
  minutesPerStop: number;
  /** Max total route duration (travel + stop time) a driver can take on, in minutes. */
  timeCapacityMin: number;
  /** Max packages a single driver can carry. */
  packageCapacity: number;
  /** Estimated travel speed in km/h by driver type — no live traffic, just a fixed estimate. */
  speedKmhByType: Record<DriverType, number>;
  /** Consecutive-stop distance above which an Andarín route gets flagged, in meters. */
  andarinMaxConsecutiveMeters: number;
};

export const DEFAULT_VRP_SETTINGS: VrpSettings = {
  minutesPerStop: 5,
  timeCapacityMin: 480,
  packageCapacity: 40,
  speedKmhByType: { andarin: 4.5, repartidor: 27 },
  andarinMaxConsecutiveMeters: 800,
};

export type VrpRoute = {
  points: RoutedPoint[];
  estimatedMinutes: number;
  overCapacity: boolean;
};

export type VrpResult = {
  routes: VrpRoute[];
  /** Human-readable, e.g. capacity shortfalls or Andarín stops too far apart. Never blocks the result. */
  warnings: string[];
};

function routeDistanceKm(points: ZonePoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) sum += haversineDistance(points[i]!, points[i + 1]!);
  return sum;
}

function estimateMinutes(points: ZonePoint[], type: DriverType, settings: VrpSettings): number {
  const speed = settings.speedKmhByType[type];
  const travelMin = (routeDistanceKm(points) / speed) * 60;
  return travelMin + points.length * settings.minutesPerStop;
}

/**
 * Clarke-Wright savings construction, merging singleton routes until exactly
 * `targetRoutes` remain (or fewer points force fewer routes). There's no
 * physical depot in this problem — deliveries aren't routed from a shared
 * warehouse stop — so each group's own centroid stands in as the "virtual
 * depot" purely as a reference point for the savings formula; it doesn't
 * appear in the output routes.
 */
function clarkeWrightConstruct(points: ZonePoint[], targetRoutes: number): ZonePoint[][] {
  const n = points.length;
  if (n === 0) return [];
  if (targetRoutes >= n) return points.map((p) => [p]);

  const depot = {
    lat: points.reduce((s, p) => s + p.lat, 0) / n,
    lon: points.reduce((s, p) => s + p.lon, 0) / n,
  };
  const distToDepot = points.map((p) => haversineDistance(depot, p));

  // Each point has up to two links (its neighbors along its route's path).
  // A point with fewer than 2 links is a valid merge endpoint.
  const linkA = new Array<number>(n).fill(-1);
  const linkB = new Array<number>(n).fill(-1);
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  }

  function degree(i: number): number {
    return (linkA[i]! >= 0 ? 1 : 0) + (linkB[i]! >= 0 ? 1 : 0);
  }

  function addLink(i: number, j: number): void {
    if (linkA[i]! < 0) linkA[i] = j;
    else linkB[i] = j;
  }

  type Saving = { i: number; j: number; s: number };
  const savings: Saving[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      savings.push({ i, j, s: distToDepot[i]! + distToDepot[j]! - haversineDistance(points[i]!, points[j]!) });
    }
  }
  savings.sort((a, b) => b.s - a.s);

  let routeCount = n;
  for (const { i, j } of savings) {
    if (routeCount <= targetRoutes) break;
    if (find(i) === find(j)) continue;
    if (degree(i) >= 2 || degree(j) >= 2) continue;
    addLink(i, j);
    addLink(j, i);
    parent[find(i)] = find(j);
    routeCount -= 1;
  }

  // Reconstruct each route by walking the link chain from an endpoint.
  const visited = new Array<boolean>(n).fill(false);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const bucket = groups.get(root);
    if (bucket) bucket.push(i);
    else groups.set(root, [i]);
  }

  const routes: ZonePoint[][] = [];
  for (const members of groups.values()) {
    const start = members.find((i) => degree(i) <= 1) ?? members[0]!;
    const path: ZonePoint[] = [];
    let prev = -1;
    let current = start;
    while (current >= 0 && !visited[current]) {
      visited[current] = true;
      path.push(points[current]!);
      const next = linkA[current] === prev ? linkB[current]! : linkA[current]!;
      prev = current;
      current = next;
    }
    routes.push(path);
  }
  return routes;
}

/** 2-opt + single-point relocation (Or-opt), bounded, for one route — reorders in place for shorter total travel distance. */
function localSearchImprove(points: ZonePoint[]): ZonePoint[] {
  if (points.length < 3) return points;
  let route = points.slice();
  const maxPasses = 25;

  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;

    // 2-opt: reverse a segment if it shortens the route.
    for (let i = 0; i < route.length - 2; i++) {
      for (let j = i + 2; j < route.length - 1; j++) {
        const a = route[i]!;
        const b = route[i + 1]!;
        const c = route[j]!;
        const d = route[j + 1]!;
        const before = haversineDistance(a, b) + haversineDistance(c, d);
        const after = haversineDistance(a, c) + haversineDistance(b, d);
        if (after + 1e-9 < before) {
          const segment = route.slice(i + 1, j + 1).reverse();
          route = [...route.slice(0, i + 1), ...segment, ...route.slice(j + 1)];
          improved = true;
        }
      }
    }

    // Or-opt: try relocating each single stop to a cheaper position.
    for (let i = 0; i < route.length; i++) {
      const point = route[i]!;
      const withoutPoint = [...route.slice(0, i), ...route.slice(i + 1)];
      let bestPos = -1;
      let bestDelta = -1e-9;
      for (let pos = 0; pos <= withoutPoint.length; pos++) {
        const before = pos > 0 ? withoutPoint[pos - 1]! : null;
        const after = pos < withoutPoint.length ? withoutPoint[pos]! : null;
        const removedEdge = before && after ? haversineDistance(before, after) : 0;
        const addedEdge =
          (before ? haversineDistance(before, point) : 0) + (after ? haversineDistance(point, after) : 0);
        const delta = removedEdge - addedEdge;
        if (delta > bestDelta) {
          bestDelta = delta;
          bestPos = pos;
        }
      }
      if (bestPos >= 0 && bestPos !== i) {
        route = [...withoutPoint.slice(0, bestPos), point, ...withoutPoint.slice(bestPos)];
        improved = true;
      }
    }

    if (!improved) break;
  }
  return route;
}

type Bucket = { points: ZonePoint[]; type: DriverType };

function bucketStats(bucket: Bucket, settings: VrpSettings): { minutes: number; overCapacity: boolean } {
  const minutes = estimateMinutes(bucket.points, bucket.type, settings);
  return {
    minutes,
    overCapacity: bucket.points.length > settings.packageCapacity || minutes > settings.timeCapacityMin,
  };
}

/**
 * Best-effort capacity rebalancing: while a route is over capacity, moves its
 * outermost stop to whichever under-capacity route can absorb it most
 * cheaply. Stops (pun intended) once nothing over capacity can be helped —
 * that's a genuine staffing shortfall, not a bug, and gets surfaced as a
 * warning instead of silently dropping packages.
 */
function rebalanceForCapacity(buckets: Bucket[], settings: VrpSettings): void {
  const maxIterations = Math.max(50, buckets.reduce((s, b) => s + b.points.length, 0) * 3);

  for (let iter = 0; iter < maxIterations; iter++) {
    let worstIdx = -1;
    let worstRatio = 1;
    buckets.forEach((b, idx) => {
      if (b.points.length === 0) return;
      const { minutes } = bucketStats(b, settings);
      const ratio = Math.max(b.points.length / settings.packageCapacity, minutes / settings.timeCapacityMin);
      if (ratio > worstRatio) {
        worstRatio = ratio;
        worstIdx = idx;
      }
    });
    if (worstIdx < 0) break; // nothing over capacity left

    const source = buckets[worstIdx]!;
    const shed = source.points[source.points.length - 1]!;

    let bestTarget = -1;
    let bestDist = Infinity;
    buckets.forEach((b, idx) => {
      if (idx === worstIdx) return;
      const wouldBePackages = b.points.length + 1;
      const wouldBeMinutes = estimateMinutes([...b.points, shed], b.type, settings);
      if (wouldBePackages > settings.packageCapacity || wouldBeMinutes > settings.timeCapacityMin) return;
      const anchor = b.points[b.points.length - 1] ?? shed;
      const dist = haversineDistance(anchor, shed);
      if (dist < bestDist) {
        bestDist = dist;
        bestTarget = idx;
      }
    });

    if (bestTarget < 0) break; // no route has room — real shortfall, stop trying to fix this one
    source.points = source.points.slice(0, -1);
    buckets[bestTarget]!.points = [...buckets[bestTarget]!.points, shed];
  }
}

function toRoutedPoints(points: ZonePoint[]): RoutedPoint[] {
  return points.map((p, i) => ({ ...p, stopNumber: i + 1 }));
}

/**
 * Builds `types.length` routes covering every point, respecting time/package
 * capacity as well as it can (Clarke-Wright savings construction + 2-opt/Or-opt
 * local search + capacity rebalancing between routes), plus a post-hoc check
 * flagging Andarín routes with stops further apart than the configured max.
 * Never invents or drops drivers — the driver count is a hard input, exactly
 * matching real staffing for the day.
 */
export function buildVrpRoutes(points: ZonePoint[], types: DriverType[], settings: VrpSettings): VrpResult {
  const targetRoutes = types.length;
  if (targetRoutes <= 0) return { routes: [], warnings: [] };

  const constructed = clarkeWrightConstruct(points, targetRoutes);
  const buckets: Bucket[] = types.map((type, i) => ({
    points: localSearchImprove(constructed[i] ?? []),
    type,
  }));

  rebalanceForCapacity(buckets, settings);
  for (const bucket of buckets) bucket.points = localSearchImprove(bucket.points);

  const warnings: string[] = [];
  const routes: VrpRoute[] = buckets.map((bucket, i) => {
    const { minutes, overCapacity } = bucketStats(bucket, settings);
    if (overCapacity) {
      const over = bucket.points.length - settings.packageCapacity;
      const overMin = Math.round(minutes - settings.timeCapacityMin);
      const parts: string[] = [];
      if (over > 0) parts.push(`${over} paquete(s) sobre su capacidad de ${settings.packageCapacity}`);
      if (overMin > 0) parts.push(`${overMin} min sobre su capacidad de ${settings.timeCapacityMin} min`);
      warnings.push(`Conductor ${i + 1}: ${parts.join(" y ")}.`);
    }
    if (bucket.type === "andarin") {
      for (let s = 0; s < bucket.points.length - 1; s++) {
        const meters = haversineDistance(bucket.points[s]!, bucket.points[s + 1]!) * 1000;
        if (meters > settings.andarinMaxConsecutiveMeters) {
          warnings.push(
            `Conductor ${i + 1} (Andarín): parada ${s + 1} y ${s + 2} están a ${Math.round(meters)}m — revisa la ruta.`,
          );
          break; // one warning per route is enough signal
        }
      }
    }
    return { points: toRoutedPoints(bucket.points), estimatedMinutes: Math.round(minutes), overCapacity };
  });

  return { routes, warnings };
}
