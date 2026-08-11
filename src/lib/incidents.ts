import type { EpodRow } from "./epod";

export type IncidentStats = {
  /** How many rows for this waybill carried a non-empty exception detail. */
  count: number;
  lastIncidentDate: string | null;
  /** Earliest date this waybill appears in the source file — a proxy for "inbound". */
  inboundDate: string | null;
  /** True when computed from the day file alone (no historical upload) — undercounts older incidents. */
  partial: boolean;
};

function hasException(row: EpodRow): boolean {
  return row.exceptionDetail.trim().length > 0;
}

/**
 * Counts incidents per waybill. Prefers the historical export (it can span
 * ~30 days, so it catches repeat exceptions the day file alone would miss);
 * falls back to the day file itself when no historical file was uploaded,
 * flagging the result as `partial` so the UI can warn it's an undercount.
 */
export function buildIncidentStats(
  dayRows: EpodRow[],
  historyRows: EpodRow[] | null,
): Record<string, IncidentStats> {
  const source = historyRows && historyRows.length > 0 ? historyRows : dayRows;
  const partial = !(historyRows && historyRows.length > 0);

  const rowsByWaybill = new Map<string, EpodRow[]>();
  for (const row of source) {
    const bucket = rowsByWaybill.get(row.waybill);
    if (bucket) bucket.push(row);
    else rowsByWaybill.set(row.waybill, [row]);
  }

  const stats: Record<string, IncidentStats> = {};
  for (const dayRow of dayRows) {
    if (stats[dayRow.waybill]) continue;
    const rows = rowsByWaybill.get(dayRow.waybill) ?? [dayRow];
    const exceptionDates = rows.filter(hasException).map((r) => r.taskDate).filter(Boolean).sort();
    const allDates = rows.map((r) => r.taskDate).filter(Boolean).sort();
    stats[dayRow.waybill] = {
      count: exceptionDates.length,
      lastIncidentDate: exceptionDates.length ? exceptionDates[exceptionDates.length - 1]! : null,
      inboundDate: allDates.length ? allDates[0]! : null,
      partial,
    };
  }
  return stats;
}
