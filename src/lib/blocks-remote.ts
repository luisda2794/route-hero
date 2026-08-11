import { supabase } from "@/integrations/supabase/client";
import type { DeliveryState, DeliveryStatus, PackageMeta, RoutingBlock, ScanState } from "./blocks";
import type { ZipGroup } from "./clustering";

/** Contenido serializado de un bloque dentro de la columna `datos` (jsonb). */
type BlockDatos = {
  groups: ZipGroup[];
  pudoGroup: ZipGroup | null;
  scanState: ScanState;
  deliveryState: DeliveryState;
  packageMeta: Record<string, PackageMeta>;
};

type BlockRow = {
  id: string;
  nombre: string;
  creado_en: string;
  datos: unknown;
};

export const BLOCKS_TABLE = "rutas_bloques";

function toBlock(row: BlockRow): RoutingBlock {
  const datos = (row.datos ?? {}) as Partial<BlockDatos>;
  return {
    id: row.id,
    createdAt: row.creado_en,
    name: row.nombre,
    groups: datos.groups ?? [],
    pudoGroup: datos.pudoGroup ?? null,
    scanState: datos.scanState ?? { scanned: {} },
    deliveryState: datos.deliveryState ?? { marked: {} },
    packageMeta: datos.packageMeta ?? {},
  };
}

function toDatos(block: RoutingBlock): BlockDatos {
  return {
    groups: block.groups,
    pudoGroup: block.pudoGroup,
    scanState: block.scanState,
    deliveryState: block.deliveryState ?? { marked: {} },
    packageMeta: block.packageMeta ?? {},
  };
}

/**
 * Todos los bloques guardados por el equipo (más recientes primero), o null
 * si la petición falla (sin conexión, etc.) — quien llame conserva su caché
 * local en ese caso, nunca la borra por un error de red pasajero.
 */
export async function fetchRemoteBlocks(): Promise<RoutingBlock[] | null> {
  const { data, error } = await supabase
    .from(BLOCKS_TABLE)
    .select("id, nombre, creado_en, datos")
    .order("creado_en", { ascending: false });
  if (error || !data) return null;
  return (data as BlockRow[]).map(toBlock);
}

/** Un bloque concreto, o null si no existe / falla la petición. */
export async function fetchRemoteBlock(id: string): Promise<RoutingBlock | null> {
  const { data, error } = await supabase
    .from(BLOCKS_TABLE)
    .select("id, nombre, creado_en, datos")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return toBlock(data as BlockRow);
}

/** Inserta o actualiza el bloque completo. Best-effort: el bloque local ya está guardado. */
export async function saveBlockRemote(block: RoutingBlock): Promise<void> {
  await supabase.from(BLOCKS_TABLE).upsert({
    id: block.id,
    nombre: block.name,
    creado_en: block.createdAt,
    actualizado_en: new Date().toISOString(),
    datos: toDatos(block) as never,
  });
}

export function deleteBlockRemote(id: string): void {
  // El query builder es perezoso: hay que encadenar .then() para que se ejecute.
  void supabase
    .from(BLOCKS_TABLE)
    .delete()
    .eq("id", id)
    .then(() => undefined);
}

/** Lee el bloque remoto, aplica el cambio sobre su jsonb y lo vuelve a guardar. */
async function mutateDatos(id: string, apply: (datos: BlockDatos) => BlockDatos): Promise<void> {
  const block = await fetchRemoteBlock(id);
  if (!block) return;
  await supabase
    .from(BLOCKS_TABLE)
    .update({ datos: apply(toDatos(block)) as never, actualizado_en: new Date().toISOString() })
    .eq("id", id);
}

export function addScanRemote(blockId: string, waybill: string, at: string): void {
  void mutateDatos(blockId, (d) => ({
    ...d,
    scanState: { scanned: { ...d.scanState.scanned, [waybill]: { scannedAt: at } } },
  }));
}

export function resetScanRemote(blockId: string): void {
  void mutateDatos(blockId, (d) => ({ ...d, scanState: { scanned: {} } }));
}

export function addDeliveryRemote(blockId: string, waybill: string, status: DeliveryStatus, at: string): void {
  void mutateDatos(blockId, (d) => ({
    ...d,
    deliveryState: { marked: { ...d.deliveryState.marked, [waybill]: { status, markedAt: at } } },
  }));
}
