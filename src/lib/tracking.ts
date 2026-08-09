import { classifyTaskStatus, type EpodRow, type TrackingStatus } from "./epod";
import type { DriverType } from "./clustering";
import type { SavedAssignments } from "./assignment";

/** A package from the freshly uploaded ePOD, cross-referenced against the saved route mapping. */
export type TrackedPackage = {
  waybill: string;
  lat: number | null;
  lon: number | null;
  address: string;
  zip: string;
  taskStatus: string;
  status: TrackingStatus;
  zoneName: string;
  driverNumber: number;
  driverType: DriverType;
  stopNumber: number;
  totalStops: number;
  isPudo: boolean;
};

export type DriverBreakdown = {
  driverNumber: number;
  zoneName: string;
  driverType: DriverType;
  delivered: number;
  failed: number;
  pending: number;
  total: number;
};

export type TrackingSnapshot = {
  generatedAt: string;
  tracked: TrackedPackage[];
  /** Rows from the uploaded file whose waybill isn't in the saved route mapping — shown separately, never mixed into the map/counters. */
  unassigned: EpodRow[];
  driverBreakdown: DriverBreakdown[];
  counts: { delivered: number; failed: number; pending: number; total: number };
};

/**
 * Cross-references every row of a freshly uploaded ePOD against the route
 * mapping saved in localStorage. Coordinates and task status always come
 * from the fresh upload (that's what makes this "live"); driver/zone/stop
 * context comes from the saved mapping, since the fresh file doesn't carry it.
 * Recomputes from scratch every time — never accumulates across uploads.
 */
export function buildTrackingSnapshot(rows: EpodRow[], assignments: SavedAssignments): TrackingSnapshot {
  const tracked: TrackedPackage[] = [];
  const unassigned: EpodRow[] = [];

  for (const row of rows) {
    const assignment = assignments.byWaybill[row.waybill];
    if (!assignment) {
      unassigned.push(row);
      continue;
    }
    tracked.push({
      waybill: row.waybill,
      lat: row.lat,
      lon: row.lon,
      address: assignment.address,
      zip: assignment.zip,
      taskStatus: row.taskStatus,
      status: classifyTaskStatus(row.taskStatus),
      zoneName: assignment.zoneName,
      driverNumber: assignment.driverNumber,
      driverType: assignment.driverType,
      stopNumber: assignment.stopNumber,
      totalStops: assignment.totalStops,
      isPudo: assignment.isPudo,
    });
  }

  const counts = { delivered: 0, failed: 0, pending: 0, total: tracked.length };
  for (const p of tracked) counts[p.status] += 1;

  const byDriver = new Map<number, DriverBreakdown>();
  for (const p of tracked) {
    const entry = byDriver.get(p.driverNumber) ?? {
      driverNumber: p.driverNumber,
      zoneName: p.zoneName,
      driverType: p.driverType,
      delivered: 0,
      failed: 0,
      pending: 0,
      total: 0,
    };
    entry[p.status] += 1;
    entry.total += 1;
    byDriver.set(p.driverNumber, entry);
  }
  const driverBreakdown = [...byDriver.values()].sort((a, b) => a.driverNumber - b.driverNumber);

  return { generatedAt: new Date().toISOString(), tracked, unassigned, driverBreakdown, counts };
}
