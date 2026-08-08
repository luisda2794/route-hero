import type { DriverType, ZipGroup } from "./clustering";
import { functionUrl, SUPABASE_ANON_KEY } from "./supabase-config";

export type WaybillAssignment = {
  waybill: string;
  zoneName: string;
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
          zoneName: zone.name,
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

/**
 * Saves this session's assignments to the shared Supabase backend, so
 * /consulta can look up a package's zone from any device — not just the one
 * that confirmed the zones. Best-effort: the local save (source of truth for
 * /escanear) already happened by the time this runs, so a failure here is
 * reported to the caller but never rolled back or retried automatically.
 */
export async function saveAssignmentsRemote(assignments: SavedAssignments): Promise<boolean> {
  try {
    const res = await fetch(functionUrl("save-session"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ packages: Object.values(assignments.byWaybill) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type PublicPackageInfo = {
  waybill: string;
  zoneName: string;
  driverNumber: number;
  driverType: DriverType;
  zip: string;
  address: string;
  stopNumber: number;
  totalStops: number;
  isPudo: boolean;
};

export type LookupResult =
  | { kind: "found"; info: PublicPackageInfo }
  | { kind: "not-found" }
  | { kind: "error" };

/** Public, unauthenticated lookup by exact waybill — used by /consulta. */
export async function lookupPackagePublic(waybill: string): Promise<LookupResult> {
  try {
    const res = await fetch(`${functionUrl("lookup-package")}?waybill=${encodeURIComponent(waybill)}`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    if (res.status === 404) return { kind: "not-found" };
    if (!res.ok) return { kind: "error" };
    const info = (await res.json()) as PublicPackageInfo;
    return { kind: "found", info };
  } catch {
    return { kind: "error" };
  }
}
