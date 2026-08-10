import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Mirrors the client's local MAX_BLOCKS cap (src/lib/blocks.ts). */
const MAX_BLOCKS = 15;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Upserts a block's structure — called once on creation (/nuevo) and again
// on every rename (Dashboard). `groups`/`pudoGroup` never change after
// creation in the app, so there's no separate partial-update path for them.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { id, createdAt, name, groups, pudoGroup } = (body ?? {}) as {
    id?: unknown;
    createdAt?: unknown;
    name?: unknown;
    groups?: unknown;
    pudoGroup?: unknown;
  };
  if (typeof id !== "string" || !id) return json({ error: "id_required" }, 400);
  if (typeof name !== "string" || !name) return json({ error: "name_required" }, 400);
  if (!Array.isArray(groups)) return json({ error: "groups_required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error: upsertError } = await supabase.from("blocks").upsert({
    id,
    created_at: typeof createdAt === "string" ? createdAt : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    name,
    groups,
    pudo_group: pudoGroup ?? null,
  });
  if (upsertError) return json({ error: "upsert_failed", details: upsertError.message }, 500);

  // Prune down to MAX_BLOCKS across the whole team, oldest first — mirrors
  // the local cap so the cloud list doesn't accumulate forever either.
  const { data: excess, error: excessError } = await supabase
    .from("blocks")
    .select("id")
    .order("created_at", { ascending: false })
    .range(MAX_BLOCKS, 100000);
  if (!excessError && excess && excess.length > 0) {
    await supabase.from("blocks").delete().in("id", excess.map((b) => b.id));
  }

  return json({ ok: true }, 200);
});
