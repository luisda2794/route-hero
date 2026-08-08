import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Public, unauthenticated lookup — anyone who has a waybill number (from the
// physical package label) can look up ONLY that one package's zone/driver +
// delivery info. There is no endpoint that lists or browses packages in
// bulk, and RLS denies all direct table access, so this exact-match query
// (via the service-role key) is the only way to read package data at all.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const waybill = (url.searchParams.get("waybill") ?? "").trim();
  if (!waybill) return json({ error: "waybill_required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("packages")
    .select("waybill, zone_name, driver_number, driver_type, zip, address, stop_number, total_stops, is_pudo")
    .eq("waybill", waybill)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return json({ error: "lookup_failed", details: error.message }, 500);
  if (!data) return json({ error: "not_found" }, 404);

  return json(
    {
      waybill: data.waybill,
      zoneName: data.zone_name,
      driverNumber: data.driver_number,
      driverType: data.driver_type,
      zip: data.zip,
      address: data.address,
      stopNumber: data.stop_number,
      totalStops: data.total_stops,
      isPudo: data.is_pudo,
    },
    200,
  );
});
