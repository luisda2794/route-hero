import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, MapPin, PackageX, Save } from "lucide-react";
import type { EpodRow } from "@/lib/epod";
import type { Zone } from "@/lib/clustering";
import { BALANCE_MARGIN_RATIO, ZONE_COLORS } from "@/lib/clustering";

const ZonesMap = lazy(() => import("./zones-map"));

export function ZonesPreview({
  zones,
  targetSize,
  unlocated,
  onZonesChange,
  onBack,
  onConfirm,
  confirmed,
}: {
  zones: Zone[];
  targetSize: number;
  unlocated: EpodRow[];
  onZonesChange: (zones: Zone[]) => void;
  onBack: () => void;
  onConfirm: () => void;
  confirmed: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const lowerMargin = targetSize * (1 - BALANCE_MARGIN_RATIO);
  const upperMargin = targetSize * (1 + BALANCE_MARGIN_RATIO);

  function renameZone(id: number, name: string) {
    onZonesChange(zones.map((z) => (z.id === id ? { ...z, name } : z)));
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Paso 3 de 4</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-foreground">RUTAFACIL</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Vista previa de zonas. Ajusta los nombres antes de confirmar.
        </p>
      </header>

      <section className="mb-6 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-foreground">Zonas ({zones.length})</h2>
          {targetSize > 0 && (
            <span className="text-sm font-semibold text-muted-foreground">
              Objetivo: ~{targetSize} paquetes por zona
            </span>
          )}
        </div>
        {zones.map((zone, idx) => {
          const color = ZONE_COLORS[idx % ZONE_COLORS.length]!;
          const outOfMargin =
            targetSize > 0 && (zone.points.length < lowerMargin || zone.points.length > upperMargin);
          return (
            <div
              key={zone.id}
              className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm"
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden
              />
              <input
                type="text"
                value={zone.name}
                onChange={(e) => renameZone(zone.id, e.target.value)}
                className="min-w-0 flex-1 rounded-xl border-2 border-border bg-background px-3 py-2 text-base font-bold text-foreground outline-none focus:border-accent"
              />
              <span
                className={`shrink-0 rounded-lg px-2.5 py-1 text-sm font-black ${
                  outOfMargin ? "bg-destructive/15 text-destructive" : "bg-accent/15 text-foreground"
                }`}
              >
                {zone.points.length}
              </span>
            </div>
          );
        })}
      </section>

      {unlocated.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
            <PackageX className="h-5 w-5 text-destructive" />
            Sin ubicación — asignar manualmente ({unlocated.length})
          </h2>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl bg-card p-3 shadow-sm">
            {unlocated.map((row) => (
              <div key={row.waybill} className="flex justify-between gap-2 text-sm">
                <span className="truncate font-semibold text-foreground">{row.waybill}</span>
                <span className="truncate text-muted-foreground">
                  {row.address || row.zip || "—"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
          <MapPin className="h-5 w-5 text-accent" />
          Mapa de zonas
        </h2>
        {mounted ? (
          <Suspense
            fallback={<div className="h-80 w-full animate-pulse rounded-2xl bg-secondary" />}
          >
            <ZonesMap zones={zones} />
          </Suspense>
        ) : (
          <div className="h-80 w-full animate-pulse rounded-2xl bg-secondary" />
        )}
      </section>

      <div className="space-y-3">
        <button
          type="button"
          onClick={onConfirm}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-5 text-xl font-black uppercase tracking-wide text-primary-foreground transition-opacity"
        >
          {confirmed ? (
            <>
              <CheckCircle2 className="h-6 w-6" />
              Zonas guardadas
            </>
          ) : (
            <>
              <Save className="h-6 w-6" />
              Confirmar y guardar zonas
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card px-6 py-4 text-lg font-bold text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
          Recalcular
        </button>
      </div>
    </main>
  );
}
