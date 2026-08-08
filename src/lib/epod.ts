import * as XLSX from "xlsx";

export type ColumnKey =
  | "waybill"
  | "taskStatus"
  | "zip"
  | "address"
  | "lat"
  | "lon"
  | "taskDate";

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
  inDeliveryToday: number;
  withoutCoords: number;
  /** Rows already filtered to today's date and in-delivery status. */
  inDeliveryRows: EpodRow[];
};

const DELIVERY_STATUSES = ["driver_received", "driver_received_incidencias"];

export function isInDeliveryStatus(status: string) {
  const norm = normalizeHeader(status).replace(/ /g, "_");
  return DELIVERY_STATUSES.some((s) => norm === s || norm.startsWith("driver_received"));
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
  })).filter((r) => r.waybill);

  const dates = rows.map((r) => r.taskDate).filter(Boolean).sort();
  const latestDate = dates.length ? (dates[dates.length - 1] ?? "") : "";

  const todayRows = rows.filter((r) => (latestDate ? r.taskDate === latestDate : true));
  const statusCounts: Record<string, number> = {};
  for (const r of todayRows) {
    const key = r.taskStatus || "(sin estado)";
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }

  const inDelivery = todayRows.filter((r) => isInDeliveryStatus(r.taskStatus));

  return {
    fileName: file.name,
    sheetName,
    headers,
    columns,
    missing,
    rows,
    latestDate,
    statusCounts,
    inDeliveryToday: inDelivery.length,
    withoutCoords: inDelivery.filter((r) => r.lat === null || r.lon === null).length,
    inDeliveryRows: inDelivery,
  };
}