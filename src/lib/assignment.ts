import type { DriverType, ZipGroup } from "./clustering";

export type WaybillAssignment = {
  waybill: string;
  driverNumber: number;
  driverType: DriverType;
  zip: string;
  address: string;
  stopNumber: number;
  totalStops: number;
  isPudo: boolean;
};

export type SavedAssignments = {
  savedAt: string;
  byWaybill: Record<string, WaybillAssignment>;
  /** Every configured driver's total stops, including drivers with 0. */
  driverTotals: Record<number, number>;
};

export type ScanRecord = { scannedAt: string };
export type ScanState = { scanned: Record<string, ScanRecord> };

const ASSIGNMENTS_KEY = "rutafacil.assignments.v1";
const SCAN_STATE_KEY = "rutafacil.scanState.v1";

/** Flattens the CP → zone → point tree into a waybill-keyed lookup. */
export function buildAssignments(groups: ZipGroup[]): SavedAssignments {
  const byWaybill: Record<string, WaybillAssignment> = {};
  const driverTotals: Record<number, number> = {};

  for (const group of groups) {
    for (const zone of group.zones) {
      driverTotals[zone.driverNumber] = zone.points.length;
      for (const point of zone.points) {
        byWaybill[point.waybill] = {
          waybill: point.waybill,
          driverNumber: zone.driverNumber,
          driverType: zone.driverType,
          // The package's own CP — for a PUDO zone, `zone.zip` is just the
          // synthetic "PUDO" label, since its points span every CP.
          zip: point.zip,
          address: point.address,
          stopNumber: point.stopNumber,
          totalStops: zone.points.length,
          isPudo: zone.kind === "pudo",
        };
      }
    }
  }

  return { savedAt: new Date().toISOString(), byWaybill, driverTotals };
}

export function saveAssignments(assignments: SavedAssignments): void {
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
}

export function loadAssignments(): SavedAssignments | null {
  const raw = localStorage.getItem(ASSIGNMENTS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedAssignments;
  } catch {
    return null;
  }
}

export function loadScanState(): ScanState {
  const raw = localStorage.getItem(SCAN_STATE_KEY);
  if (!raw) return { scanned: {} };
  try {
    return JSON.parse(raw) as ScanState;
  } catch {
    return { scanned: {} };
  }
}

export function saveScanState(state: ScanState): void {
  localStorage.setItem(SCAN_STATE_KEY, JSON.stringify(state));
}

/** Clears scan progress only — the zone/stop mapping itself is untouched. */
export function resetScanState(): void {
  localStorage.removeItem(SCAN_STATE_KEY);
}
