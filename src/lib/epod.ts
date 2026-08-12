import * as XLSX from "xlsx";

export type ColumnKey =
  | "waybill"
  | "taskStatus"
  | "zip"
  | "address"
  | "lat"
  | "lon"
  | "taskDate"
  | "deliveryType"
  | "exceptionDetail"
  | "marketPlaceName"
  | "sellerName"
  | "driverName";

/** Bilingual (ES/EN) header aliases for the Cainiao ePOD export. */
export const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  waybill: ["numero de waybill", "n de waybill", "waybill number", "waybill no", "waybill"],
  taskStatus: ["estado de la tarea", "estado tarea", "task status", "status de la tarea", "status"],
  zip: ["codigo postal", "cp", "zip code", "zipcode", "postal code"],
  address: [
    "direccion detallada",
    "direccion",
    "detailed address",
    "address detail",
    "receiver address",
    "address",
  ],
  lat: [
    "receptor a latitud",
    "latitud del receptor",
    "latitud",
    "receiver to latitude",
    "receiver latitude",
    "latitude",
    "lat",
  ],
  lon: [
    "receptor a longitud",
    "longitud del receptor",
    "longitud",
    "receiver to longitude",
    "receiver longitude",
    "longitude",
    "lng",
    "lon",
  ],
  taskDate: ["fecha de la tarea", "fecha tarea", "task date", "fecha"],
  deliveryType: ["tipo de entrega", "delivery type", "tipo entrega"],
  exceptionDetail: ["detalles de la excepcion", "detalle de la excepcion", "exception detail", "detalles excepcion"],
  marketPlaceName: ["nombre del mercado", "market place name", "marketplace name", "nombre mercado"],
  sellerName: ["nombre del vendedor", "seller name", "nombre vendedor"],
  driverName: ["conductor", "repartidor", "nombre del conductor", "driver name", "driver"],
};

export const REQUIRED_COLUMNS: ColumnKey[] = ["waybill", "taskStatus", "taskDate"];

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type ResolvedColumns = Partial<Record<ColumnKey, string>>;

/** Maps each logical column to the actual header found in the sheet. */
export function resolveColumns(headers: string[]): ResolvedColumns {
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  const resolved: ResolvedColumns = {};
  const used = new Set<string>();

  for (const key of Object.keys(COLUMN_ALIASES) as ColumnKey[]) {
    const aliases = COLUMN_ALIASES[key].map(normalizeHeader);
    let match =
      normalized.find((h) => !used.has(h.raw) && aliases.includes(h.norm)) ??
      normalized.find(
        (h) => !used.has(h.raw) && aliases.some((a) => h.norm.includes(a) || a.includes(h.norm)),
      );
    if (match) {
      resolved[key] = match.raw;
      used.add(match.raw);
    }
  }
  return resolved;
}

export type EpodRow = {
  waybill: string;
  taskStatus: string;
  zip: string;
  address: string;
  lat: number | null;
  lon: number | null;
  taskDate: string;
  /** Raw "Tipo de Entrega" value, e.g. "TO_DOOR" or "PUDO". Empty if the column wasn't found. */
  deliveryType: string;
  /** Non-empty means this row recorded a delivery exception — used to count incidents per waybill. */
  exceptionDetail: string;
  marketPlaceName: string;
  sellerName: string;
  /** Whoever the ePOD credits with the delivery — empty if the column wasn't found. */
  driverName: string;
};

export type EpodParseResult = {
  fileName: string;
  sheetName: string;
  headers: string[];
  columns: ResolvedColumns;
  missing: ColumnKey[];
  rows: EpodRow[];
  latestDate: string;
  statusCounts: Record<string, number>;
  totalToRoute: number;
  withoutCoords: number;
  /** Every row in the file with a waybill — regardless of date or task status. */
  inDeliveryRows: EpodRow[];
};

/** Bucket label for rows with no CP detected. */
export const NO_ZIP_LABEL = "(sin CP)";

export type ZipTypeSummary = { zip: string; homeCount: number; pudoCount: number };

/** Packages per CP split by delivery type, sorted from highest to lowest total volume. */
export function summarizeByZipAndType(rows: EpodRow[]): ZipTypeSummary[] {
  const counts = new Map<string, { homeCount: number; pudoCount: number }>();
  for (const row of rows) {
    const key = row.zip || NO_ZIP_LABEL;
    const entry = counts.get(key) ?? { homeCount: 0, pudoCount: 0 };
    if (isPudoDelivery(row.deliveryType)) entry.pudoCount += 1;
    else entry.homeCount += 1;
    counts.set(key, entry);
  }
  return [...counts.entries()]
    .map(([zip, { homeCount, pudoCount }]) => ({ zip, homeCount, pudoCount }))
    .sort((a, b) => b.homeCount + b.pudoCount - (a.homeCount + a.pudoCount));
}

/** PUDO/locker deliveries — everything else (e.g. "TO_DOOR") is a regular home delivery. */
const PUDO_DELIVERY_TYPES = ["pudo"];

export function isPudoDelivery(deliveryType: string): boolean {
  return PUDO_DELIVERY_TYPES.includes(normalizeHeader(deliveryType));
}

export type TrackingStatus = "delivered" | "failed" | "pending";

const DELIVERED_STATUSES = ["entregado", "delivered"];
const FAILED_STATUSES = ["attempt failure", "cancelar", "cancel", "cancelled", "canceled"];

/** Everything that isn't a recognized delivered/failed status counts as pending. */
export function classifyTaskStatus(taskStatus: string): TrackingStatus {
  const norm = normalizeHeader(taskStatus);
  if (DELIVERED_STATUSES.includes(norm)) return "delivered";
  if (FAILED_STATUSES.includes(norm)) return "failed";
  return "pending";
}

/** Coarser than `TrackingStatus` — used by /visual, which has no zone/driver context to fall back on, so "received" and truly-other statuses (e.g. "Assigned") are told apart instead of both landing in "pending". */
export type VisualStatus = "delivered" | "failed" | "received" | "other";

const RECEIVED_STATUSES = ["driver received", "driver received incidencias"];

export function classifyVisualStatus(taskStatus: string): VisualStatus {
  const norm = normalizeHeader(taskStatus);
  if (DELIVERED_STATUSES.includes(norm)) return "delivered";
  if (FAILED_STATUSES.includes(norm)) return "failed";
  if (RECEIVED_STATUSES.includes(norm)) return "received";
  return "other";
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toDateKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${m}-${d}`;
    }
  }
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const iso = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  const dmy = raw.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  return raw;
}

export async function parseEpodFile(file: File): Promise<EpodParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { cellDates: true });
  const sheetName = workbook.SheetNames[0] ?? "";
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("El archivo no contiene hojas legibles.");

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const headers = raw[0] ? Object.keys(raw[0]) : [];
  const columns = resolveColumns(headers);
  const missing = REQUIRED_COLUMNS.filter((key) => !columns[key]);

  const rows: EpodRow[] = raw.map((r) => ({
    waybill: String(columns.waybill ? (r[columns.waybill] ?? "") : "").trim(),
    taskStatus: String(columns.taskStatus ? (r[columns.taskStatus] ?? "") : "").trim(),
    zip: String(columns.zip ? (r[columns.zip] ?? "") : "").trim(),
    address: String(columns.address ? (r[columns.address] ?? "") : "").trim(),
    lat: columns.lat ? toNumber(r[columns.lat]) : null,
    lon: columns.lon ? toNumber(r[columns.lon]) : null,
    taskDate: columns.taskDate ? toDateKey(r[columns.taskDate]) : "",
    deliveryType: String(columns.deliveryType ? (r[columns.deliveryType] ?? "") : "").trim(),
    exceptionDetail: String(columns.exceptionDetail ? (r[columns.exceptionDetail] ?? "") : "").trim(),
    marketPlaceName: String(columns.marketPlaceName ? (r[columns.marketPlaceName] ?? "") : "").trim(),
    sellerName: String(columns.sellerName ? (r[columns.sellerName] ?? "") : "").trim(),
    driverName: String(columns.driverName ? (r[columns.driverName] ?? "") : "").trim(),
  })).filter((r) => r.waybill);

  const dates = rows.map((r) => r.taskDate).filter(Boolean).sort();
  const latestDate = dates.length ? (dates[dates.length - 1] ?? "") : "";

  const statusCounts: Record<string, number> = {};
  for (const r of rows) {
    const key = r.taskStatus || "(sin estado)";
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }

  // Route every package in the file — regardless of task status (e.g.
  // "Attempt Failure" still needs a driver/area for a retry) and regardless
  // of date, since a merged/multi-day export shouldn't silently drop every
  // date but the most recent one.
  const inDelivery = rows;

  return {
    fileName: file.name,
    sheetName,
    headers,
    columns,
    missing,
    rows,
    latestDate,
    statusCounts,
    totalToRoute: inDelivery.length,
    withoutCoords: inDelivery.filter((r) => r.lat === null || r.lon === null).length,
    inDeliveryRows: inDelivery,
  };
}