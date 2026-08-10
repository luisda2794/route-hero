import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/** Mirrors the client's local MAX_BLOCKS cap (src/lib/blocks.ts) so the cloud list never grows unbounded either. */
const MAX_BLOCKS = 15;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Every device's Dashboard/Escaneo/Conductor/Seguimiento calls this on load
// to see every block the team has created from any device. RLS denies
// direct table access, so this (via the service-role key) is the only way
// to list blocks at all.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: blocks, error: blocksError } = await supabase
    .from("blocks")
    .select("id, created_at, name, groups, pudo_group")
    .order("created_at", { ascending: false })
    .limit(MAX_BLOCKS);

  if (blocksError) return json({ error: "list_failed", details: blocksError.message }, 500);
  if (!blocks || blocks.length === 0) return json({ blocks: [] }, 200);

  const ids = blocks.map((b) => b.id as string);

  const [scanRes, markRes] = await Promise.all([
    supabase.from("scan_marks").select("block_id, waybill, scanned_at").in("block_id", ids),
    supabase.from("delivery_marks").select("block_id, waybill, status, marked_at").in("block_id", ids),
  ]);
  if (scanRes.error) return json({ error: "scans_failed", details: scanRes.error.message }, 500);
  if (markRes.error) return json({ error: "marks_failed", details: markRes.error.message }, 500);

  const scannedByBlock = new Map<string, Record<string, { scannedAt: string }>>();
  for (const row of scanRes.data ?? []) {
    const bucket = scannedByBlock.get(row.block_id as string) ?? {};
    bucket[row.waybill as string] = { scannedAt: row.scanned_at as string };
    scannedByBlock.set(row.block_id as string, bucket);
  }

  const markedByBlock = new Map<string, Record<string, { status: string; markedAt: string }>>();
  for (const row of markRes.data ?? []) {
    const bucket = markedByBlock.get(row.block_id as string) ?? {};
    bucket[row.waybill as string] = { status: row.status as string, markedAt: row.marked_at as string };
    markedByBlock.set(row.block_id as string, bucket);
  }

  const result = blocks.map((b) => ({
    id: b.id,
    createdAt: b.created_at,
    name: b.name,
    groups: b.groups,
    pudoGroup: b.pudo_group,
    scanState: { scanned: scannedByBlock.get(b.id as string) ?? {} },
    deliveryState: { marked: markedByBlock.get(b.id as string) ?? {} },
  }));

  return json({ blocks: result }, 200);
});
