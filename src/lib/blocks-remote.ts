import { functionUrl, SUPABASE_ANON_KEY } from "./supabase-config";
import type { DeliveryStatus, RoutingBlock } from "./blocks";

const HEADERS = {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

/**
 * Every block the team has saved from any device, or null on any failure
 * (offline, function down, etc.) — callers keep using their local cache
 * when this happens, never wiping it out over a transient network error.
 */
export async function fetchRemoteBlocks(): Promise<RoutingBlock[] | null> {
  try {
    const res = await fetch(functionUrl("list-blocks"), { headers: HEADERS });
    if (!res.ok) return null;
    const body = (await res.json()) as { blocks: RoutingBlock[] };
    return body.blocks;
  } catch {
    return null;
  }
}

/** Best-effort — the local block is already saved regardless of the outcome. */
export async function saveBlockRemote(block: RoutingBlock): Promise<void> {
  try {
    await fetch(functionUrl("save-block"), {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        id: block.id,
        createdAt: block.createdAt,
        name: block.name,
        groups: block.groups,
        pudoGroup: block.pudoGroup,
      }),
    });
  } catch {
    // best-effort
  }
}

export function deleteBlockRemote(id: string): void {
  void fetch(functionUrl("delete-block"), {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ id }),
  }).catch(() => {
    // best-effort
  });
}

export function addScanRemote(blockId: string, waybill: string, at: string): void {
  void fetch(functionUrl("update-block-state"), {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ blockId, action: "add-scan", waybill, at }),
  }).catch(() => {
    // best-effort
  });
}

export function resetScanRemote(blockId: string): void {
  void fetch(functionUrl("update-block-state"), {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ blockId, action: "reset-scan" }),
  }).catch(() => {
    // best-effort
  });
}

export function addDeliveryRemote(blockId: string, waybill: string, status: DeliveryStatus, at: string): void {
  void fetch(functionUrl("update-block-state"), {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ blockId, action: "add-delivery", waybill, status, at }),
  }).catch(() => {
    // best-effort
  });
}
