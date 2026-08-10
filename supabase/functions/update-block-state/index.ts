import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Single endpoint for every frequent, per-waybill mutation a block goes
// through after creation — each action upserts/deletes individual rows
// (never the whole block blob), so two devices acting on different (or the
// same) waybill at once never clobber each other's unrelated changes.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { blockId, action } = (body ?? {}) as { blockId?: unknown; action?: unknown };
  if (typeof blockId !== "string" || !blockId) return json({ error: "blockId_required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (action === "add-scan") {
    const { waybill, at } = body as { waybill?: unknown; at?: unknown };
    if (typeof waybill !== "string" || !waybill) return json({ error: "waybill_required" }, 400);
    const { error } = await supabase
      .from("scan_marks")
      .upsert(
        { block_id: blockId, waybill, scanned_at: typeof at === "string" ? at : new Date().toISOString() },
        { onConflict: "block_id,waybill" },
      );
    if (error) return json({ error: "add_scan_failed", details: error.message }, 500);
    return json({ ok: true }, 200);
  }

  if (action === "add-delivery") {
    const { waybill, status, at } = body as { waybill?: unknown; status?: unknown; at?: unknown };
    if (typeof waybill !== "string" || !waybill) return json({ error: "waybill_required" }, 400);
    if (status !== "delivered" && status !== "failed") return json({ error: "invalid_status" }, 400);
    const { error } = await supabase
      .from("delivery_marks")
      .upsert(
        {
          block_id: blockId,
          waybill,
          status,
          marked_at: typeof at === "string" ? at : new Date().toISOString(),
        },
        { onConflict: "block_id,waybill" },
      );
    if (error) return json({ error: "add_delivery_failed", details: error.message }, 500);
    return json({ ok: true }, 200);
  }

  if (action === "reset-scan") {
    const { error } = await supabase.from("scan_marks").delete().eq("block_id", blockId);
    if (error) return json({ error: "reset_scan_failed", details: error.message }, 500);
    return json({ ok: true }, 200);
  }

  return json({ error: "unknown_action" }, 400);
});
