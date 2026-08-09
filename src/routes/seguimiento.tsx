import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Footprints,
  PackageX,
  Truck,
  Upload,
  XCircle,
} from "lucide-react";
import { parseEpodFile } from "@/lib/epod";
import { loadAssignments, type SavedAssignments } from "@/lib/assignment";
import { buildTrackingSnapshot, type TrackingSnapshot } from "@/lib/tracking";
import { AdminNav } from "@/components/admin-nav";

const TrackingMap = lazy(() => import("@/components/tracking-map"));

export const Route = createFileRoute("/seguimiento")({
  head: () => ({
    meta: [
      { title: "RutaFacil — Seguimiento" },
      {
        name: "description",
        content: "Mapa en vivo del estado de entrega de cada paquete del día.",
      },
    ],
  }),
  component: SeguimientoPage,
});

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${min}`;
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function SeguimientoPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<SavedAssignments | null>(null);
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setAssignments(loadAssignments());
  }, []);

  async function handleFile(file: File | undefined) {
    if (!file || !assignments) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = await parseEpodFile(file);
      setSnapshot(buildTrackingSnapshot(parsed.inDeliveryRows, assignments));
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8 lg:max-w-5xl">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Seguimiento</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-foreground">RUTAFACIL</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Mapa en vivo del estado de entrega de cada paquete del día.
        </p>
      </header>

      <AdminNav />

      {mounted && !assignments && (
        <div className="rounded-2xl bg-card p-6 text-center shadow-sm">
          <p className="text-lg font-bold text-foreground">No hay zonas guardadas todavía</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Vuelve al Paso 1, calcula las zonas y confirma antes de hacer seguimiento.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground"
          >
            Ir al Paso 1
          </Link>
        </div>
      )}

      {assignments && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFile(e.dataTransfer.files?.[0]);
            }}
            className={`mb-2 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-6 text-center transition-colors ${
              dragging ? "border-accent bg-accent/10" : "border-border bg-card"
            }`}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-base font-bold text-foreground">
              {loading ? "Procesando..." : "Sube el ePOD actualizado para refrescar el estado"}
            </span>
            <span className="text-sm text-muted-foreground">Arrastra el archivo o toca para elegirlo</span>
          </button>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {snapshot && (
            <>
              <p className="mb-6 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <Clock className="h-4 w-4" />
                Última actualización: {formatUpdatedAt(snapshot.generatedAt)}
                {fileName && ` · ${fileName}`}
              </p>

              <section className="mb-6 grid grid-cols-3 gap-3">
                <CounterCard
                  icon={<CheckCircle2 className="h-6 w-6" />}
                  label="Entregados"
                  count={snapshot.counts.delivered}
                  percent={pct(snapshot.counts.delivered, snapshot.counts.total)}
                  className="bg-success/15 text-success"
                />
                <CounterCard
                  icon={<XCircle className="h-6 w-6" />}
                  label="Fallados"
                  count={snapshot.counts.failed}
                  percent={pct(snapshot.counts.failed, snapshot.counts.total)}
                  className="bg-destructive/15 text-destructive"
                />
                <CounterCard
                  icon={<Clock className="h-6 w-6" />}
                  label="Pendientes"
                  count={snapshot.counts.pending}
                  percent={pct(snapshot.counts.pending, snapshot.counts.total)}
                  className="bg-pending/15 text-pending"
                />
              </section>

              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <section>
                  <h2 className="mb-3 text-lg font-bold text-foreground">Mapa de entregas</h2>
                  {mounted ? (
                    <Suspense
                      fallback={<div className="h-[28rem] w-full animate-pulse rounded-2xl bg-secondary" />}
                    >
                      <TrackingMap packages={snapshot.tracked} />
                    </Suspense>
                  ) : (
                    <div className="h-[28rem] w-full animate-pulse rounded-2xl bg-secondary" />
                  )}
                </section>

                <section className="space-y-4">
                  <div>
                    <h2 className="mb-3 text-lg font-bold text-foreground">Por conductor</h2>
                    <div className="space-y-3">
                      {snapshot.driverBreakdown.map((d) => (
                        <div key={d.driverNumber} className="rounded-2xl bg-card p-3 shadow-sm">
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className="shrink-0 rounded-lg bg-secondary p-1.5 text-foreground">
                              {d.driverType === "andarin" ? (
                                <Footprints className="h-4 w-4" />
                              ) : (
                                <Truck className="h-4 w-4" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                              Conductor {d.driverNumber} — {d.zoneName}
                            </span>
                            <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                              {d.delivered + d.failed}/{d.total}
                            </span>
                          </div>
                          <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
                            {d.delivered > 0 && (
                              <div
                                className="h-full bg-success"
                                style={{ width: `${(d.delivered / d.total) * 100}%` }}
                              />
                            )}
                            {d.failed > 0 && (
                              <div
                                className="h-full bg-destructive"
                                style={{ width: `${(d.failed / d.total) * 100}%` }}
                              />
                            )}
                            {d.pending > 0 && (
                              <div
                                className="h-full bg-pending"
                                style={{ width: `${(d.pending / d.total) * 100}%` }}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {snapshot.unassigned.length > 0 && (
                    <div>
                      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
                        <PackageX className="h-5 w-5 text-destructive" />
                        Sin ruta asignada ({snapshot.unassigned.length})
                      </h2>
                      <div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl bg-card p-3 shadow-sm">
                        {snapshot.unassigned.map((row) => (
                          <div key={row.waybill} className="flex justify-between gap-2 text-sm">
                            <span className="truncate font-semibold text-foreground">{row.waybill}</span>
                            <span className="truncate text-muted-foreground">{row.taskStatus || "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}

function CounterCard({
  icon,
  label,
  count,
  percent,
  className,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  percent: string;
  className: string;
}) {
  return (
    <div className={`rounded-2xl p-3 text-center ${className}`}>
      <div className="flex justify-center">{icon}</div>
      <p className="mt-1 text-2xl font-black">{count}</p>
      <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
      <p className="text-xs font-semibold opacity-80">{percent}</p>
    </div>
  );
}
