import type { Zone, ZipGroup } from "./clustering";
import { buildAssignments, type SavedAssignments } from "./assignment";
import {
  addDeliveryRemote,
  addScanRemote,
  deleteBlockRemote,
  fetchRemoteBlocks,
  resetScanRemote,
  saveBlockRemote,
} from "./blocks-remote";

export type ScanRecord = { scannedAt: string };
export type ScanState = { scanned: Record<string, ScanRecord> };

export type DeliveryStatus = "delivered" | "failed";
export type DeliveryRecord = { status: DeliveryStatus; markedAt: string };
/**
 * Driver-confirmed delivery outcome per waybill — separate from `scanState`,
 * which only tracks the warehouse load-out scan, not what actually happened
 * on the route.
 */
export type DeliveryState = { marked: Record<string, DeliveryRecord> };

/**
 * A single "Bloque de enrutamiento" — everything computed the last time zones
 * were confirmed for a given ePOD: the full zone structure (not just the
 * flattened waybill map, so the Dashboard can draw the map without re-parsing
 * anything) plus this block's own scan progress.
 */
export type RoutingBlock = {
  id: string;
  createdAt: string;
  name: string;
  groups: ZipGroup[];
  pudoGroup: ZipGroup | null;
  scanState: ScanState;
  /** Optional — blocks saved before this field existed simply have none marked yet. */
  deliveryState?: DeliveryState;
};

type BlocksStore = { blocks: RoutingBlock[]; activeBlockId: string | null };

const BLOCKS_KEY = "rutafacil.blocks.v1";
/** Keep at most this many blocks — oldest are dropped first. */
const MAX_BLOCKS = 15;
const EMPTY_STORE: BlocksStore = { blocks: [], activeBlockId: null };

function loadStore(): BlocksStore {
  const raw = localStorage.getItem(BLOCKS_KEY);
  if (!raw) return EMPTY_STORE;
  try {
    const parsed = JSON.parse(raw) as BlocksStore;
    if (!Array.isArray(parsed.blocks)) return EMPTY_STORE;
    return parsed;
  } catch {
    return EMPTY_STORE;
  }
}

/** Saves the store, dropping the oldest block(s) and retrying if the quota is full. */
function saveStore(store: BlocksStore): void {
  let attempt = store;
  for (;;) {
    try {
      localStorage.setItem(BLOCKS_KEY, JSON.stringify(attempt));
      return;
    } catch {
      if (attempt.blocks.length <= 1) return; // nothing left to drop — give up silently
      attempt = { ...attempt, blocks: attempt.blocks.slice(0, -1) };
    }
  }
}

/** Newest first. */
export function listBlocks(): RoutingBlock[] {
  return loadStore().blocks;
}

export function getActiveBlockId(): string | null {
  return loadStore().activeBlockId;
}

export function setActiveBlockId(id: string): void {
  const store = loadStore();
  if (!store.blocks.some((b) => b.id === id)) return;
  saveStore({ ...store, activeBlockId: id });
}

/**
 * The active block if one is set, otherwise falls back to the most recent
 * block (and adopts it as active) — so /escanear and /seguimiento still work
 * for someone who never visited the Dashboard to pick one explicitly.
 */
export function getActiveBlockOrMostRecent(): RoutingBlock | null {
  const store = loadStore();
  const active = store.activeBlockId ? store.blocks.find((b) => b.id === store.activeBlockId) : null;
  if (active) return active;
  const mostRecent = store.blocks[0];
  if (!mostRecent) return null;
  saveStore({ ...store, activeBlockId: mostRecent.id });
  return mostRecent;
}

function defaultBlockName(createdAt: Date): string {
  const dd = String(createdAt.getDate()).padStart(2, "0");
  const mm = String(createdAt.getMonth() + 1).padStart(2, "0");
  return `Enrutamiento ${dd}/${mm}`;
}

/**
 * Creates a new block, makes it the active one, and prunes down to
 * `MAX_BLOCKS`. Awaits the remote save (best-effort) before returning, so a
 * device that immediately syncs afterward — e.g. navigating straight to the
 * Dashboard — doesn't race ahead of the block actually landing in the cloud.
 */
export async function createBlock(
  groups: ZipGroup[],
  pudoGroup: ZipGroup | null,
  name?: string,
): Promise<RoutingBlock> {
  const now = new Date();
  const block: RoutingBlock = {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    name: name?.trim() || defaultBlockName(now),
    groups,
    pudoGroup,
    scanState: { scanned: {} },
    deliveryState: { marked: {} },
  };
  const store = loadStore();
  const blocks = [block, ...store.blocks].slice(0, MAX_BLOCKS);
  saveStore({ blocks, activeBlockId: block.id });
  await saveBlockRemote(block);
  return block;
}

export function renameBlock(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const store = loadStore();
  const blocks = store.blocks.map((b) => (b.id === id ? { ...b, name: trimmed } : b));
  saveStore({ ...store, blocks });
  const renamed = blocks.find((b) => b.id === id);
  if (renamed) void saveBlockRemote(renamed);
}

/** Renames one zone (identified by its driver number) within an already-saved block — e.g. the driver's own name from the /conductor panel. */
export function renameZoneInBlock(blockId: string, driverNumber: number, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const renameIn = (group: ZipGroup): ZipGroup => ({
    ...group,
    zones: group.zones.map((z) => (z.driverNumber === driverNumber ? { ...z, name: trimmed } : z)),
  });
  const store = loadStore();
  const blocks = store.blocks.map((b) =>
    b.id === blockId
      ? { ...b, groups: b.groups.map(renameIn), pudoGroup: b.pudoGroup ? renameIn(b.pudoGroup) : null }
      : b,
  );
  saveStore({ ...store, blocks });
}

/** Pushes a block's current contents to the cloud — call on blur after a rename, not on every keystroke. */
export function syncBlockToRemote(id: string): void {
  const block = loadStore().blocks.find((b) => b.id === id);
  if (block) void saveBlockRemote(block);
}

/** Removes a block locally and in the cloud (cascades its scan/delivery marks remotely). */
export function deleteBlock(id: string): void {
  const store = loadStore();
  const blocks = store.blocks.filter((b) => b.id !== id);
  const activeBlockId = store.activeBlockId === id ? blocks[0]?.id ?? null : store.activeBlockId;
  saveStore({ blocks, activeBlockId });
  deleteBlockRemote(id);
}

/**
 * Pulls every block from the cloud and, if reachable, makes it the new
 * local cache verbatim — the cloud is the merged source of truth once
 * online, so a block deleted or marked from another device shows up here
 * too. Leaves the local cache untouched on failure (offline-safe). Returns
 * whether the cache actually changed.
 */
export async function syncBlocksFromRemote(): Promise<boolean> {
  const remoteBlocks = await fetchRemoteBlocks();
  if (!remoteBlocks) return false;
  const store = loadStore();
  const activeBlockId =
    store.activeBlockId && remoteBlocks.some((b) => b.id === store.activeBlockId)
      ? store.activeBlockId
      : remoteBlocks[0]?.id ?? null;
  saveStore({ blocks: remoteBlocks, activeBlockId });
  return true;
}

/** Records one scanned waybill (warehouse load-out) and pushes it to the cloud — returns the updated state, or null if the block doesn't exist. */
export function markScanned(id: string, waybill: string): ScanState | null {
  const store = loadStore();
  const block = store.blocks.find((b) => b.id === id);
  if (!block) return null;
  const scannedAt = new Date().toISOString();
  const scanState: ScanState = { scanned: { ...block.scanState.scanned, [waybill]: { scannedAt } } };
  const blocks = store.blocks.map((b) => (b.id === id ? { ...b, scanState } : b));
  saveStore({ ...store, blocks });
  addScanRemote(id, waybill, scannedAt);
  return scanState;
}

/** Clears a block's scan progress, locally and in the cloud — for "Reiniciar sesión de escaneo". */
export function resetScanState(id: string): ScanState {
  const emptyScanState: ScanState = { scanned: {} };
  const store = loadStore();
  const blocks = store.blocks.map((b) => (b.id === id ? { ...b, scanState: emptyScanState } : b));
  saveStore({ ...store, blocks });
  resetScanRemote(id);
  return emptyScanState;
}

/** A block's delivery state, defaulting to empty for blocks saved before this field existed. */
export function deliveryStateOf(block: RoutingBlock): DeliveryState {
  return block.deliveryState ?? { marked: {} };
}

/** Records a driver's delivery outcome for one waybill and pushes it to the cloud — returns the updated state, or null if the block doesn't exist. */
export function markDelivery(id: string, waybill: string, status: DeliveryStatus): DeliveryState | null {
  const store = loadStore();
  const block = store.blocks.find((b) => b.id === id);
  if (!block) return null;
  const markedAt = new Date().toISOString();
  const current = deliveryStateOf(block);
  const deliveryState: DeliveryState = { marked: { ...current.marked, [waybill]: { status, markedAt } } };
  const blocks = store.blocks.map((b) => (b.id === id ? { ...b, deliveryState } : b));
  saveStore({ ...store, blocks });
  addDeliveryRemote(id, waybill, status, markedAt);
  return deliveryState;
}

/** All of a block's zones — home CPs plus the PUDO route, if any. */
function allGroupsOf(block: RoutingBlock): ZipGroup[] {
  return block.pudoGroup ? [...block.groups, block.pudoGroup] : block.groups;
}

/** Every zone across a block, flattened — lets /conductor find a driver's zone by `driverNumber` without caring whether it's a home CP or the PUDO route. */
export function allZonesOf(block: RoutingBlock): Zone[] {
  return allGroupsOf(block).flatMap((g) => g.zones);
}

/** Flattened waybill→zone lookup for a block, derived on demand — never stored redundantly. */
export function assignmentsForBlock(block: RoutingBlock): SavedAssignments {
  return buildAssignments(allGroupsOf(block));
}

export function blockPackageCount(block: RoutingBlock): number {
  return allGroupsOf(block).reduce((sum, g) => sum + g.totalPackages, 0);
}

export function blockDriverCount(block: RoutingBlock): number {
  return allGroupsOf(block).reduce((sum, g) => sum + g.zones.length, 0);
}
