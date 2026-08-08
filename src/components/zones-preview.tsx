import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ChevronDown, MapPin, PackageX, ScanLine, Save } from "lucide-react";
import type { EpodRow } from "@/lib/epod";
import type { ZipGroup } from "@/lib/clustering";
import { BALANCE_MARGIN_RATIO, assignZoneColors } from "@/lib/clustering";

const ZonesMap = lazy(() => import("./zones-map"));

export function ZonesPreview({
  groups,
  unlocated,
  onGroupsChange,
  onBack,
  onConfirm,
  confirmed,
}: {
  groups: ZipGroup[];
  unlocated: EpodRow[];
  onGroupsChange: (groups: ZipGroup[]) => void;
  onBack: () => void;
  onConfirm: () => void;
  confirmed: boolean;
}) {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null);

  const zoneColors = useMemo(() => assignZoneColors(groups), [groups]);
  const allZones = useMemo(() => groups.flatMap((g) => g.zones), [groups]);

  function renameZone(zip: string, zoneId: string, name: string) {
    onGroupsChange(
      groups.map((g) =>
        g.zip === zip ? { ...g, zones: g.zones.map((z) => (z.id === zoneId ? { ...z, name } : z)) } : g,
      ),
    );
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

      <section className="mb-6 space-y-5">
        <h2 className="text-lg font-bold text-foreground">Zonas por Código Postal</h2>
        {groups.map((group) => {
          const lowerMargin = group.targetSize * (1 - BALANCE_MARGIN_RATIO);
          const upperMargin = group.targetSize * (1 + BALANCE_MARGIN_RATIO);
          return (
            <div key={group.zip} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-base font-black text-foreground">CP {group.zip}</h3>
                {group.targetSize > 0 && (
                  <span className="text-sm font-semibold text-muted-foreground">
                    Objetivo: ~{group.targetSize} paquetes por zona
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {group.zones.map((zone) => {
                  const outOfMargin =
                    group.targetSize > 0 &&
                    (zone.points.length < lowerMargin || zone.points.length > upperMargin);
                  const expanded = expandedZoneId === zone.id;
                  return (
                    <div key={zone.id} className="rounded-2xl bg-card p-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-4 w-4 shrink-0 rounded-full"
                          style={{ backgroundColor: zoneColors[zone.id] ?? "#999999" }}
                          aria-hidden
                        />
                        <input
                          type="text"
                          value={zone.name}
                          onChange={(e) => renameZone(group.zip, zone.id, e.target.value)}
                          className="min-w-0 flex-1 rounded-xl border-2 border-border bg-background px-3 py-2 text-base font-bold text-foreground outline-none focus:border-accent"
                        />
                        <span
                          className={`shrink-0 rounded-lg px-2.5 py-1 text-sm font-black ${
                            outOfMargin
                              ? "bg-destructive/15 text-destructive"
                              : "bg-accent/15 text-foreground"
                          }`}
                        >
                          {zone.points.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => setExpandedZoneId(expanded ? null : zone.id)}
                          disabled={zone.points.length === 0}
                          aria-label="Ver orden de paradas"
                          className="shrink-0 rounded-lg p-1.5 text-muted-foreground disabled:opacity-30"
                        >
                          <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </button>
                      </div>
                      {expanded && (
                        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl bg-background p-2">
                          {zone.points.map((p) => (
                            <div key={p.waybill} className="flex items-center gap-2 text-sm">
                              <span className="w-6 shrink-0 text-right font-black text-accent">
                                {p.stopNumber}
                              </span>
                              <span className="truncate font-semibold text-foreground">{p.waybill}</span>
                              <span className="truncate text-muted-foreground">{p.address || "—"}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
                  {row.zip ? `CP ${row.zip}` : "Sin CP"} · {row.address || "—"}
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
            <ZonesMap zones={allZones} colors={zoneColors} />
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
        {confirmed && (
          <button
            type="button"
            onClick={() => void navigate({ to: "/escanear" })}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-success px-6 py-5 text-xl font-black uppercase tracking-wide text-success-foreground"
          >
            <ScanLine className="h-6 w-6" />
            Ir a escanear
          </button>
        )}
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
