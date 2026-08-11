import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, Navigation, PackageCheck } from "lucide-react";
import { getActiveBlockOrMostRecent, type RoutingBlock } from "@/lib/blocks";
import { allDriverProgress } from "@/lib/driver";
import { CLIENT_CATEGORY_COLORS, CLIENT_CATEGORY_LABELS, type ClientCategory } from "@/lib/client-category";
import { googleMapsUrl } from "@/lib/geo";
import { AdminNav } from "@/components/admin-nav";
import { usePollRemoteSync } from "@/hooks/use-poll-remote-sync";

export const Route = createFileRoute("/priorizar")({
  head: () => ({
    meta: [
      { title: "RutaFacil — Paquetes a priorizar" },
      {
        name: "description",
        content: "Paquetes con incidencias repetidas, ordenados por prioridad, con acceso directo a Google Maps.",
      },
    ],
  }),
  component: PriorizarPage,
});

type PriorityRow = {
  waybill: string;
  address: string;
  zip: string;
  lat: number;
  lon: number;
  driverNumber: number;
  zoneName: string;
  stopNumber: number;
  clientCategory: ClientCategory;
  count: number;
  lastIncidentDate: string | null;
  partial: boolean;
};

function PriorizarPage() {
  const [mounted, setMounted] = useState(false);
  const [activeBlock, setActiveBlock] = useState<RoutingBlock | null>(null);

  useEffect(() => {
    setMounted(true);
    setActiveBlock(getActiveBlockOrMostRecent());
  }, []);

  usePollRemoteSync(() => setActiveBlock(getActiveBlockOrMostRecent()));

  const rows: PriorityRow[] = useMemo(() => {
    if (!activeBlock) return [];
    return allDriverProgress(activeBlock)
      .flatMap((driver) =>
        driver.stops.map((stop) => ({
          waybill: stop.waybill,
          address: stop.address,
          zip: stop.zip,
          lat: stop.lat,
          lon: stop.lon,
          driverNumber: driver.driverNumber,
          zoneName: driver.zoneName,
          stopNumber: stop.stopNumber,
          clientCategory: stop.clientCategory,
          count: stop.count,
          lastIncidentDate: stop.lastIncidentDate,
          partial: stop.partial,
        })),
      )
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [activeBlock]);

  const anyPartial = rows.some((r) => r.partial);

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8 lg:max-w-3xl">
      <AdminNav />

      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Priorizar</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-foreground">Paquetes a priorizar</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Ordenados por número de incidencias, de mayor a menor.
        </p>
      </header>

      {mounted && !activeBlock && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-lg font-bold text-foreground">No hay ningún bloque activo</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Crea un bloque nuevo o elige uno en el Dashboard.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/nuevo" className="inline-block rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">
              Crear bloque
            </Link>
            <Link to="/" className="inline-block rounded-xl border border-border bg-card px-5 py-3 font-bold text-foreground">
              Ir al Dashboard
            </Link>
          </div>
        </div>
      )}

      {mounted && activeBlock && (
        <>
          {anyPartial && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-pending/10 p-3 text-sm font-semibold text-pending">
              <History className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                Algunas incidencias son parciales — este bloque se creó sin ePOD Histórico, así que
                el conteo solo refleja el día de la ruta.
              </span>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-6 text-center">
              <PackageCheck className="h-8 w-8 text-muted-foreground" />
              <p className="text-base font-semibold text-foreground">
                Ningún paquete de este bloque tiene incidencias registradas.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.waybill} className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                        <span className="truncate text-sm font-bold text-foreground">{row.waybill}</span>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white"
                          style={{ backgroundColor: CLIENT_CATEGORY_COLORS[row.clientCategory] }}
                        >
                          {CLIENT_CATEGORY_LABELS[row.clientCategory]}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        Conductor {row.driverNumber} — {row.zoneName} · Parada {row.stopNumber} · CP {row.zip}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{row.address || "—"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-lg font-black text-destructive">{row.count}</span>
                      <a
                        href={googleMapsUrl(row)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Ir al waybill ${row.waybill} en Google Maps`}
                        className="flex items-center justify-center rounded-lg bg-secondary p-2 text-foreground"
                      >
                        <Navigation className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-muted-foreground">
                    Última incidencia: {row.lastIncidentDate || "—"}
                    {row.partial && " · parcial"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
