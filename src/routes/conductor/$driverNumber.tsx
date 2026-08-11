import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Footprints,
  MapPin,
  Navigation,
  Truck,
  XCircle,
} from "lucide-react";
import type { WaybillAssignment } from "@/lib/assignment";
import {
  assignmentsForBlock,
  getActiveBlockOrMostRecent,
  markDelivery,
  renameZoneInBlock,
  syncBlockToRemote,
  syncBlocksFromRemote,
  type RoutingBlock,
} from "@/lib/blocks";
import { colorForDriverNumber, type ZipGroup } from "@/lib/clustering";
import { driverProgressFor, type DriverStop } from "@/lib/driver";
import { CLIENT_CATEGORY_COLORS, CLIENT_CATEGORY_LABELS } from "@/lib/client-category";
import { googleMapsUrl } from "@/lib/geo";
import { AdminNav } from "@/components/admin-nav";
import { usePollRemoteSync } from "@/hooks/use-poll-remote-sync";

const DriverZoneMap = lazy(() => import("@/components/driver-zone-map"));

export const Route = createFileRoute("/conductor/$driverNumber")({
  head: () => ({
    meta: [
      { title: "RutaFacil — Mis paradas" },
      {
        name: "description",
        content: "Toca cada parada, o escribe el waybill, para marcarla como entregada o fallada.",
      },
    ],
  }),
  component: ConductorDetailPage,
});

type ScanOutcome =
  | { kind: "own"; stop: DriverStop }
  | { kind: "other"; assignment: WaybillAssignment }
  | { kind: "not-found"; text: string };

function playFeedback(kind: "success" | "warning" | "error") {
  navigator.vibrate?.(kind === "success" ? 80 : kind === "warning" ? [60, 40, 60] : 200);
}

function CategoryBadge({ category }: { category: DriverStop["clientCategory"] }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white"
      style={{ backgroundColor: CLIENT_CATEGORY_COLORS[category] }}
    >
      {CLIENT_CATEGORY_LABELS[category]}
    </span>
  );
}

function StatusIcon({ status }: { status: DriverStop["status"] }) {
  if (status === "delivered") return <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />;
  if (status === "failed") return <XCircle className="h-5 w-5 shrink-0 text-destructive" />;
  return <Clock className="h-5 w-5 shrink-0 text-pending" />;
}

function ConductorDetailPage() {
  const { driverNumber: driverNumberParam } = Route.useParams();
  const driverNumber = Number(driverNumberParam);

  const [mounted, setMounted] = useState(false);
  const [activeBlock, setActiveBlock] = useState<RoutingBlock | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [justScannedWaybill, setJustScannedWaybill] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setActiveBlock(getActiveBlockOrMostRecent());
    void syncBlocksFromRemote().then((changed) => {
      if (changed) setActiveBlock(getActiveBlockOrMostRecent());
    });
  }, []);

  usePollRemoteSync(() => setActiveBlock(getActiveBlockOrMostRecent()));

  // "own" stays on screen until the driver picks Entregado/Fallado; every
  // other outcome (and an already-decided "own") auto-dismisses.
  useEffect(() => {
    if (!outcome) return;
    if (outcome.kind === "own" && outcome.stop.status === "pending") return;
    const delay = outcome.kind === "own" ? 1200 : 2500;
    const t = setTimeout(() => setOutcome(null), delay);
    return () => clearTimeout(t);
  }, [outcome]);

  const progress = useMemo(
    () => (activeBlock ? driverProgressFor(activeBlock, driverNumber) : null),
    [activeBlock, driverNumber],
  );
  const assignments = useMemo(() => (activeBlock ? assignmentsForBlock(activeBlock) : null), [activeBlock]);

  const driverColor = colorForDriverNumber(driverNumber);
  const statusByWaybill = useMemo(() => {
    const map: Record<string, DriverStop["status"]> = {};
    if (!progress) return map;
    for (const s of progress.stops) map[s.waybill] = s.status;
    return map;
  }, [progress]);
  const zoneForMap = useMemo(() => {
    if (!progress) return null;
    return {
      id: `driver-${progress.driverNumber}`,
      zip: progress.stops[0]?.zip ?? "",
      kind: progress.isPudo ? ("pudo" as const) : ("home" as const),
      driverType: progress.driverType,
      driverNumber: progress.driverNumber,
      name: progress.zoneName,
      points: progress.stops,
    };
  }, [progress]);
  const nextPendingStop = useMemo(
    () => progress?.stops.find((s) => s.status === "pending") ?? null,
    [progress],
  );
  const completedCount = progress ? progress.delivered + progress.failed : 0;
  const completionPct = progress && progress.total > 0 ? Math.round((completedCount / progress.total) * 100) : 0;

  function handleRenameZone(name: string) {
    if (!activeBlock) return;
    renameZoneInBlock(activeBlock.id, driverNumber, name);
    setActiveBlock((prev) => {
      if (!prev) return prev;
      const renameIn = (group: ZipGroup): ZipGroup => ({
        ...group,
        zones: group.zones.map((z) => (z.driverNumber === driverNumber ? { ...z, name } : z)),
      });
      return {
        ...prev,
        groups: prev.groups.map(renameIn),
        pudoGroup: prev.pudoGroup ? renameIn(prev.pudoGroup) : null,
      };
    });
  }

  function markStop(waybill: string, status: "delivered" | "failed") {
    if (!activeBlock) return;
    const nextDeliveryState = markDelivery(activeBlock.id, waybill, status);
    if (!nextDeliveryState) return;
    setActiveBlock({ ...activeBlock, deliveryState: nextDeliveryState });
    const markedAt = nextDeliveryState.marked[waybill]!.markedAt;
    setOutcome((prev) =>
      prev && prev.kind === "own" && prev.stop.waybill === waybill
        ? { kind: "own", stop: { ...prev.stop, status, markedAt } }
        : prev,
    );
    playFeedback("success");
  }

  function lookupWaybill(text: string) {
    if (!assignments || !progress) return;
    const assignment = assignments.byWaybill[text];
    if (!assignment) {
      setOutcome({ kind: "not-found", text });
      playFeedback("error");
      return;
    }
    if (assignment.driverNumber !== driverNumber) {
      setOutcome({ kind: "other", assignment });
      playFeedback("warning");
      return;
    }
    const stop = progress.stops.find((s) => s.waybill === text);
    if (!stop) return; // assignment says this driver, but stop list disagrees — shouldn't happen
    setOutcome({ kind: "own", stop });
    setJustScannedWaybill(stop.waybill);
    playFeedback("success");
  }

  function handleManualSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = manualInput.trim();
    if (!text) return;
    lookupWaybill(text);
    setManualInput("");
  }

  if (mounted && (!activeBlock || !progress)) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8">
        <AdminNav />
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-lg font-bold text-foreground">
            {activeBlock ? `No existe el conductor ${driverNumber} en este bloque` : "No hay ningún bloque activo"}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/conductor" className="inline-block rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">
              Ver conductores
            </Link>
            <Link to="/" className="inline-block rounded-xl border border-border bg-card px-5 py-3 font-bold text-foreground">
              Ir al Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8">
      <AdminNav />

      <Link to="/conductor" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
        <ArrowLeft className="h-4 w-4" />
        Todos los conductores
      </Link>

      {progress && (
        <>
          <header className="mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Conductor {progress.driverNumber}</p>
            <input
              type="text"
              value={progress.zoneName}
              onChange={(e) => handleRenameZone(e.target.value)}
              onBlur={() => activeBlock && syncBlockToRemote(activeBlock.id)}
              aria-label="Nombre del conductor / zona"
              className="mt-1 w-full rounded-lg bg-transparent text-3xl font-black tracking-tight text-foreground outline-none focus:bg-secondary/50 focus:px-2 focus:py-1 focus:-mx-2"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-black uppercase tracking-wide text-foreground">
                {progress.driverType === "andarin" ? (
                  <Footprints className="h-3.5 w-3.5" />
                ) : (
                  <Truck className="h-3.5 w-3.5" />
                )}
                {progress.driverType === "andarin" ? "Andarín" : "Repartidor"}
              </span>
              {progress.isPudo && (
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-black uppercase tracking-wide text-foreground">
                  Ruta PUDO
                </span>
              )}
            </div>
          </header>

          <section className="mb-6">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-sm font-bold text-foreground">
                {completedCount} de {progress.total} paradas completadas
              </span>
              <span className="text-sm font-black text-accent">{completionPct}%</span>
            </div>
            <div className="h-4 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </section>

          {zoneForMap && zoneForMap.points.length > 0 && (
            <section className="mb-6">
              {mounted ? (
                <Suspense fallback={<div className="h-72 w-full animate-pulse rounded-xl bg-secondary" />}>
                  <DriverZoneMap
                    zone={zoneForMap}
                    color={driverColor}
                    statusByWaybill={statusByWaybill}
                    highlightedWaybill={justScannedWaybill}
                    className="h-72 w-full rounded-xl border border-border"
                  />
                </Suspense>
              ) : (
                <div className="h-72 w-full animate-pulse rounded-xl bg-secondary" />
              )}
            </section>
          )}

          {nextPendingStop && (
            <button
              type="button"
              onClick={() => setOutcome({ kind: "own", stop: nextPendingStop })}
              className="mb-6 flex w-full items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-left"
            >
              <Navigation className="h-6 w-6 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-accent">Siguiente parada</p>
                <p className="truncate text-sm font-bold text-foreground">
                  Parada {nextPendingStop.stopNumber} · CP {nextPendingStop.zip} · {nextPendingStop.address || "—"}
                </p>
              </div>
            </button>
          )}

          <section className="mb-6 grid grid-cols-3 gap-3">
            <CounterCard
              icon={<CheckCircle2 className="h-6 w-6" />}
              label="Entregados"
              count={progress.delivered}
              className="bg-success/15 text-success"
            />
            <CounterCard
              icon={<XCircle className="h-6 w-6" />}
              label="Fallados"
              count={progress.failed}
              className="bg-destructive/15 text-destructive"
            />
            <CounterCard
              icon={<Clock className="h-6 w-6" />}
              label="Pendientes"
              count={progress.pending}
              className="bg-pending/15 text-pending"
            />
          </section>

          <form onSubmit={handleManualSubmit} className="mb-6 flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Escribe el número de waybill"
              className="min-w-0 flex-1 rounded-xl border border-border bg-card px-4 py-3 text-base font-semibold text-foreground outline-none focus:border-accent"
            />
            <button type="submit" className="shrink-0 rounded-xl bg-accent px-5 py-3 font-bold text-accent-foreground">
              Buscar
            </button>
          </form>

          <h2 className="mb-3 text-lg font-bold text-foreground">Mis paradas ({progress.total})</h2>
          <div className="space-y-2">
            {progress.stops.map((stop) => (
              <div
                key={stop.waybill}
                className={`flex items-center gap-2 rounded-xl border p-3 ${
                  stop.count >= 2
                    ? "border-destructive bg-destructive/5"
                    : stop.waybill === justScannedWaybill
                      ? "border-accent bg-accent/10"
                      : "border-border bg-card"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOutcome({ kind: "own", stop })}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <StatusIcon status={stop.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-foreground">
                        Parada {stop.stopNumber} · CP {stop.zip}
                      </p>
                      {stop.count >= 2 && (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="2 o más incidencias" />
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{stop.address || "—"}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <p className="truncate text-xs text-muted-foreground">{stop.waybill}</p>
                      <CategoryBadge category={stop.clientCategory} />
                      {stop.count > 0 && (
                        <span className="shrink-0 text-[10px] font-bold text-destructive">
                          {stop.count} incid.
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <a
                  href={googleMapsUrl(stop)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Ir a la parada ${stop.stopNumber} en Google Maps`}
                  className="flex shrink-0 items-center justify-center rounded-lg bg-secondary p-2.5 text-foreground"
                >
                  <Navigation className="h-5 w-5" />
                </a>
              </div>
            ))}
          </div>
        </>
      )}

      {outcome && (
        <div
          onClick={() => outcome.kind !== "own" && setOutcome(null)}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-6 text-center ${
            outcome.kind === "other"
              ? "bg-warning"
              : outcome.kind === "not-found"
                ? "bg-destructive"
                : outcome.stop.status === "delivered"
                  ? "bg-success"
                  : outcome.stop.status === "failed"
                    ? "bg-destructive"
                    : "bg-card"
          }`}
        >
          {outcome.kind === "own" && (
            <>
              <MapPin className={outcome.stop.status === "pending" ? "h-12 w-12 text-foreground" : "h-12 w-12 text-white"} />
              <p className={outcome.stop.status === "pending" ? "text-3xl font-black text-foreground" : "text-3xl font-black text-white"}>
                Parada {outcome.stop.stopNumber}
              </p>
              <p
                className={
                  outcome.stop.status === "pending"
                    ? "text-lg font-semibold text-muted-foreground"
                    : "text-lg font-semibold text-white/90"
                }
              >
                CP {outcome.stop.zip} · {outcome.stop.address || "—"}
              </p>
              <div className="mt-4 flex w-full max-w-xs gap-3">
                <button
                  type="button"
                  onClick={() => markStop(outcome.stop.waybill, "delivered")}
                  className={`flex-1 rounded-xl px-4 py-4 text-lg font-black ${
                    outcome.stop.status === "delivered" ? "bg-white text-success" : "bg-success/80 text-white"
                  }`}
                >
                  Entregado
                </button>
                <button
                  type="button"
                  onClick={() => markStop(outcome.stop.waybill, "failed")}
                  className={`flex-1 rounded-xl px-4 py-4 text-lg font-black ${
                    outcome.stop.status === "failed" ? "bg-white text-destructive" : "bg-destructive/80 text-white"
                  }`}
                >
                  Fallado
                </button>
              </div>
              <button
                type="button"
                onClick={() => setOutcome(null)}
                className={
                  outcome.stop.status === "pending"
                    ? "mt-2 text-sm text-muted-foreground underline"
                    : "mt-2 text-sm text-white/80 underline"
                }
              >
                Cerrar
              </button>
            </>
          )}
          {outcome.kind === "other" && (
            <>
              <AlertTriangle className="h-14 w-14 text-warning-foreground" />
              <p className="mt-2 text-2xl font-bold text-warning-foreground">No es tuyo</p>
              <p className="mt-2 text-3xl font-black text-warning-foreground">
                Conductor {outcome.assignment.driverNumber} — {outcome.assignment.zoneName}
              </p>
            </>
          )}
          {outcome.kind === "not-found" && (
            <>
              <AlertTriangle className="h-14 w-14 text-destructive-foreground" />
              <p className="mt-4 text-4xl font-black text-destructive-foreground">No encontrado</p>
              <p className="mt-2 text-xl font-semibold text-destructive-foreground/90">Verificar — {outcome.text}</p>
            </>
          )}
          {outcome.kind !== "own" && <p className="mt-8 text-sm text-white/70">Toca para seguir escaneando</p>}
        </div>
      )}
    </main>
  );
}

function CounterCard({
  icon,
  label,
  count,
  className,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  className: string;
}) {
  return (
    <div className={`rounded-2xl p-3 text-center ${className}`}>
      <div className="flex justify-center">{icon}</div>
      <p className="mt-1 text-2xl font-black">{count}</p>
      <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
    </div>
  );
}
