import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Cloud,
  CloudOff,
  Footprints,
  LayoutDashboard,
  Loader2,
  PackageCheck,
  PackageSearch,
  PackageX,
  ScanLine,
  Save,
  Truck,
} from "lucide-react";
import type { EpodRow } from "@/lib/epod";
import type { Zone, ZipGroup } from "@/lib/clustering";
import { assignZoneColors } from "@/lib/clustering";

const ZonesMap = lazy(() => import("./zones-map"));

export function ZonesPreview({
  groups,
  pudoGroup,
  unlocated,
  warnings = [],
  onGroupsChange,
  onPudoGroupChange,
  onBack,
  onConfirm,
  confirmed,
  creating,
  remoteSaveStatus,
}: {
  groups: ZipGroup[];
  pudoGroup: ZipGroup | null;
  unlocated: EpodRow[];
  /** Capacity shortfalls, Andarín stops too far apart, or a K-means-fallback note from the route calculation. */
  warnings?: string[];
  onGroupsChange: (groups: ZipGroup[]) => void;
  onPudoGroupChange: (group: ZipGroup) => void;
  onBack: () => void;
  onConfirm: (name: string) => void;
  confirmed: boolean;
  creating: boolean;
  remoteSaveStatus: "idle" | "saving" | "ok" | "error";
}) {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [blockName, setBlockName] = useState("");
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
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8 lg:max-w-6xl">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Paso 3 de 4</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-foreground">RUTAFACIL</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Vista previa de zonas. Ajusta los nombres antes de confirmar.
        </p>
      </header>

      {warnings.length > 0 && (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-warning-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {warnings.length} aviso{warnings.length > 1 ? "s" : ""} del cálculo de rutas
          </p>
          <ul className="space-y-1 text-sm text-warning-foreground/90">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          {mounted ? (
            <Suspense fallback={<div className="h-[60vh] w-full animate-pulse rounded-xl bg-secondary" />}>
              <ZonesMap
                zones={allZones}
                colors={zoneColors}
                className="h-[60vh] w-full rounded-xl border border-border lg:h-[calc(100vh-12rem)]"
              />
            </Suspense>
          ) : (
            <div className="h-[60vh] w-full animate-pulse rounded-xl bg-secondary" />
          )}
        </section>

        <aside className="flex flex-col gap-5 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-1">
          <section className="space-y-5">
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
            <section className="space-y-2">
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
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
                <PackageX className="h-5 w-5 text-destructive" />
                Sin ubicación — asignar manualmente ({unlocated.length})
              </h2>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-3">
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

          <div className="space-y-3">
            {!confirmed && (
              <label className="block">
                <span className="text-sm font-bold text-foreground">Nombre del bloque (opcional)</span>
                <input
                  type="text"
                  value={blockName}
                  onChange={(e) => setBlockName(e.target.value)}
                  placeholder={`Ej. Ruta ${new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" })}`}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-4 py-3 text-base font-semibold text-foreground outline-none focus:border-accent"
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => onConfirm(blockName)}
              disabled={creating || confirmed}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-5 text-xl font-black uppercase tracking-wide text-primary-foreground transition-opacity disabled:opacity-70"
            >
              {confirmed ? (
                <>
                  <CheckCircle2 className="h-6 w-6" />
                  Bloque guardado
                </>
              ) : creating ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  Creando bloque…
                </>
              ) : (
                <>
                  <Save className="h-6 w-6" />
                  Confirmar y crear bloque
                </>
              )}
            </button>
            {confirmed && remoteSaveStatus !== "idle" && (
              <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-muted-foreground">
                {remoteSaveStatus === "saving" && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando para consulta desde cualquier dispositivo…
                  </>
                )}
                {remoteSaveStatus === "ok" && (
                  <>
                    <Cloud className="h-4 w-4 text-success" />
                    Disponible en /consulta desde cualquier dispositivo
                  </>
                )}
                {remoteSaveStatus === "error" && (
                  <>
                    <CloudOff className="h-4 w-4 text-destructive" />
                    No se pudo guardar en la nube — /consulta no tendrá esta sesión (revisa tu conexión)
                  </>
                )}
              </p>
            )}
            {confirmed && (
              <button
                type="button"
                onClick={() => void navigate({ to: "/" })}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-success px-6 py-4 text-lg font-bold text-success-foreground"
              >
                <LayoutDashboard className="h-5 w-5" />
                Ir al Dashboard
              </button>
            )}
            {confirmed && (
              <button
                type="button"
                onClick={() => void navigate({ to: "/escanear" })}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 font-bold text-foreground"
              >
                <ScanLine className="h-5 w-5" />
                Ir a escanear
              </button>
            )}
            {confirmed && remoteSaveStatus === "ok" && (
              <button
                type="button"
                onClick={() => void navigate({ to: "/consulta" })}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent bg-accent/10 px-4 py-3 font-bold text-accent"
              >
                <PackageSearch className="h-5 w-5" />
                Ir a consulta pública
              </button>
            )}
            <button
              type="button"
              onClick={onBack}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-4 text-lg font-bold text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
              Recalcular
            </button>
          </div>
        </aside>
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
          return (
            <div key={zone.id} className="rounded-xl border border-border bg-card p-3">
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
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-base font-bold text-foreground outline-none focus:border-accent"
                />
                {zone.overCapacity && (
                  <AlertTriangle
                    className="h-4 w-4 shrink-0 text-destructive"
                    aria-label="Sobre su capacidad de tiempo o paquetes"
                  />
                )}
                <span className="shrink-0 rounded-lg bg-accent/15 px-2.5 py-1 text-sm font-black text-foreground">
                  {zone.points.length}
                  {zone.estimatedMinutes !== undefined && (
                    <span className="ml-1 font-semibold text-muted-foreground">
                      · ~{zone.estimatedMinutes}min
                    </span>
                  )}
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
              {expanded && (
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg bg-background p-2">
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
