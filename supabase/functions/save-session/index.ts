import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type IncomingPackage = {
  waybill?: unknown;
  zoneName?: unknown;
  driverNumber?: unknown;
  driverType?: unknown;
  zip?: unknown;
  address?: unknown;
  stopNumber?: unknown;
  totalStops?: unknown;
  isPudo?: unknown;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { label, packages } = (body ?? {}) as { label?: unknown; packages?: unknown };
  if (!Array.isArray(packages) || packages.length === 0) {
    return json({ error: "packages_required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({ label: typeof label === "string" && label.trim() ? label.trim() : null })
    .select("id")
    .single();

  if (sessionError || !session) {
    return json({ error: "session_insert_failed", details: sessionError?.message }, 500);
  }

  const rows = (packages as IncomingPackage[])
    .filter((p) => typeof p.waybill === "string" && p.waybill.trim().length > 0)
    .map((p) => ({
      session_id: session.id as string,
      waybill: String(p.waybill).trim(),
      zone_name: typeof p.zoneName === "string" ? p.zoneName : "",
      driver_number: Number(p.driverNumber) || 0,
      driver_type: p.driverType === "andarin" ? "andarin" : "repartidor",
      zip: typeof p.zip === "string" ? p.zip : "",
      address: typeof p.address === "string" ? p.address : "",
      stop_number: Number(p.stopNumber) || 0,
      total_stops: Number(p.totalStops) || 0,
      is_pudo: Boolean(p.isPudo),
    }));

  if (rows.length === 0) return json({ error: "no_valid_packages" }, 400);

  const { error: insertError } = await supabase.from("packages").insert(rows);
  if (insertError) {
    return json({ error: "packages_insert_failed", details: insertError.message }, 500);
  }

  return json({ sessionId: session.id, savedCount: rows.length }, 200);
});
