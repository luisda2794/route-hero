import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Footprints,
  MapPin,
  PackageCheck,
  PackageX,
  ScanLine,
  Save,
  Truck,
} from "lucide-react";
import type { EpodRow } from "@/lib/epod";
import type { Zone, ZipGroup } from "@/lib/clustering";
import { MAX_AREA_SIZE, MIN_AREA_SIZE, assignZoneColors } from "@/lib/clustering";

const ZonesMap = lazy(() => import("./zones-map"));

export function ZonesPreview({
  groups,
  pudoGroup,
  unlocated,
  onGroupsChange,
  onPudoGroupChange,
  onBack,
  onConfirm,
  confirmed,
}: {
  groups: ZipGroup[];
  pudoGroup: ZipGroup | null;
  unlocated: EpodRow[];
  onGroupsChange: (groups: ZipGroup[]) => void;
  onPudoGroupChange: (group: ZipGroup) => void;
  onBack: () => void;
  onConfirm: () => void;
  confirmed: boolean;
}) {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null);

  const allGroups = useMemo(() => (pudoGroup ? [...groups, pudoGroup] : groups), [groups, pudoGroup]);
  const zoneColors = useMemo(() => assignZoneColors(allGroups), [allGroups]);
  const allZones = useMemo(() => allGroups.flatMap((g) => g.zones), [allGroups]);

  function renameZone(zip: string, zoneId: string, name: string) {
    if (pudoGroup && zip === pudoGroup.zip) {
      onPudoGroupChange({
        ...pudoGroup,
        zones: pudoGroup.zones.map((z) => (z.id === zoneId ? { ...z, name } : z)),
      });
      return;
    }
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
          Vista previa de zonas. Cada CP tiene exactamente las áreas que pediste — ajusta los
          nombres antes de confirmar.
        </p>
      </header>

      <section className="mb-6 space-y-5">
        <h2 className="text-lg font-bold text-foreground">Zonas por Código Postal</h2>
        {groups.map((group) => (
          <ZoneGroupCard
            key={group.zip}
            title={`CP ${group.zip}`}
            group={group}
            colors={zoneColors}
            expandedZoneId={expandedZoneId}
            onToggleExpand={(id) => setExpandedZoneId(expandedZoneId === id ? null : id)}
            onRename={(zoneId, name) => renameZone(group.zip, zoneId, name)}
          />
        ))}
      </section>

      {pudoGroup && pudoGroup.zones.length > 0 && (
        <section className="mb-6 space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <PackageCheck className="h-5 w-5 text-accent" />
            Ruta PUDO
          </h2>
          <ZoneGroupCard
            title="Ruta PUDO (todos los CP)"
            group={pudoGroup}
            colors={zoneColors}
            expandedZoneId={expandedZoneId}
            onToggleExpand={(id) => setExpandedZoneId(expandedZoneId === id ? null : id)}
            onRename={(zoneId, name) => renameZone(pudoGroup.zip, zoneId, name)}
          />
        </section>
      )}

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

function ZoneGroupCard({
  title,
  group,
  colors,
  expandedZoneId,
  onToggleExpand,
  onRename,
}: {
  title: string;
  group: ZipGroup;
  colors: Record<string, string>;
  expandedZoneId: string | null;
  onToggleExpand: (zoneId: string) => void;
  onRename: (zoneId: string, name: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-base font-black text-foreground">{title}</h3>
      <div className="space-y-2">
        {group.zones.map((zone: Zone) => {
          const expanded = expandedZoneId === zone.id;
          const warnings: string[] = [];
          if (zone.isOversized) warnings.push(`más de ${MAX_AREA_SIZE} paquetes`);
          if (zone.isUndersized) warnings.push(`menos de ${MIN_AREA_SIZE} paquetes`);
          if (zone.driverType === "andarin" && zone.hasLongWalkGap) {
            warnings.push("más de 800 m entre algunas paradas");
          }
          return (
            <div key={zone.id} className="rounded-2xl bg-card p-3 shadow-sm">
              <div className="flex items-center gap-3">
                <span
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: colors[zone.id] ?? "#999999" }}
                  aria-hidden
                />
                <span
                  title={zone.driverType === "andarin" ? "Andarín" : "Repartidor"}
                  className="shrink-0 rounded-lg bg-secondary p-1.5 text-foreground"
                >
                  {zone.driverType === "andarin" ? (
                    <Footprints className="h-4 w-4" />
                  ) : (
                    <Truck className="h-4 w-4" />
                  )}
                </span>
                <input
                  type="text"
                  value={zone.name}
                  onChange={(e) => onRename(zone.id, e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border-2 border-border bg-background px-3 py-2 text-base font-bold text-foreground outline-none focus:border-accent"
                />
                <span className="shrink-0 rounded-lg bg-accent/15 px-2.5 py-1 text-sm font-black text-foreground">
                  {zone.points.length}
                </span>
                <button
                  type="button"
                  onClick={() => onToggleExpand(zone.id)}
                  disabled={zone.points.length === 0}
                  aria-label="Ver orden de paradas"
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground disabled:opacity-30"
                >
                  <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
              </div>
              {warnings.length > 0 && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {warnings.join(" · ")}
                </p>
              )}
              {expanded && (
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl bg-background p-2">
                  {zone.points.map((p) => (
                    <div key={p.waybill} className="flex items-center gap-2 text-sm">
                      <span className="w-6 shrink-0 text-right font-black text-accent">{p.stopNumber}</span>
                      <span className="truncate font-semibold text-foreground">{p.waybill}</span>
                      <span className="truncate text-muted-foreground">{p.address || "—"}</span>
                      {zone.kind === "pudo" && p.zip && (
                        <span className="shrink-0 text-xs text-muted-foreground">CP {p.zip}</span>
                      )}
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
}
