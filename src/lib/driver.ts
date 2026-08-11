import type { DriverType, RoutedPoint } from "./clustering";
import {
  allZonesOf,
  deliveryStateOf,
  packageMetaOf,
  type DeliveryState,
  type PackageMeta,
  type RoutingBlock,
} from "./blocks";

export type StopStatus = "pending" | "delivered" | "failed";

/** Fallback for waybills with no classification/incident data — blocks saved before that feature, or a lookup miss. */
const UNKNOWN_PACKAGE_META: PackageMeta = {
  clientCategory: "local",
  count: 0,
  lastIncidentDate: null,
  inboundDate: null,
  partial: true,
};

/** One of a driver's stops, with its delivery status merged in from the block's `DeliveryState`, and client/incident data from its `PackageMeta`. */
export type DriverStop = RoutedPoint & PackageMeta & { status: StopStatus; markedAt: string | null };

export type DriverProgress = {
  driverNumber: number;
  zoneName: string;
  driverType: DriverType;
  isPudo: boolean;
  stops: DriverStop[];
  delivered: number;
  failed: number;
  pending: number;
  total: number;
};

function toStops(
  points: RoutedPoint[],
  deliveryState: DeliveryState,
  packageMeta: Record<string, PackageMeta>,
): DriverStop[] {
  return points
    .slice()
    .sort((a, b) => a.stopNumber - b.stopNumber)
    .map((point) => {
      const record = deliveryState.marked[point.waybill];
      const meta = packageMeta[point.waybill] ?? UNKNOWN_PACKAGE_META;
      return { ...point, ...meta, status: record?.status ?? "pending", markedAt: record?.markedAt ?? null };
    });
}

function progressFromStops(
  driverNumber: number,
  zoneName: string,
  driverType: DriverType,
  isPudo: boolean,
  stops: DriverStop[],
): DriverProgress {
  const counts = { delivered: 0, failed: 0, pending: 0 };
  for (const stop of stops) counts[stop.status] += 1;
  return { driverNumber, zoneName, driverType, isPudo, stops, ...counts, total: stops.length };
}

/** This driver's stops (ordered by `stopNumber`) plus delivery counters, or null if the block has no zone for that driver number. */
export function driverProgressFor(block: RoutingBlock, driverNumber: number): DriverProgress | null {
  const zone = allZonesOf(block).find((z) => z.driverNumber === driverNumber);
  if (!zone) return null;
  const stops = toStops(zone.points, deliveryStateOf(block), packageMetaOf(block));
  return progressFromStops(zone.driverNumber, zone.name, zone.driverType, zone.kind === "pudo", stops);
}

/** Every driver in the block that has at least one stop, sorted by `driverNumber` — for the /conductor index. */
export function allDriverProgress(block: RoutingBlock): DriverProgress[] {
  const deliveryState = deliveryStateOf(block);
  const packageMeta = packageMetaOf(block);
  return allZonesOf(block)
    .filter((zone) => zone.points.length > 0)
    .map((zone) =>
      progressFromStops(
        zone.driverNumber,
        zone.name,
        zone.driverType,
        zone.kind === "pudo",
        toStops(zone.points, deliveryState, packageMeta),
      ),
    )
    .sort((a, b) => a.driverNumber - b.driverNumber);
}
