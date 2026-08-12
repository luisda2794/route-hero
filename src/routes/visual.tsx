import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Eye, MapPin, Truck, Upload, XCircle } from "lucide-react";
import { parseEpodFile, classifyVisualStatus, type EpodParseResult } from "@/lib/epod";
import type { VisualPoint } from "@/components/visual-map";
import { AdminNav } from "@/components/admin-nav";

const VisualMap = lazy(() => import("@/components/visual-map"));

export const Route = createFileRoute("/visual")({
  head: () => ({
    meta: [
      { title: "RutaFacil — Visual" },
      {
        name: "description",
        content: "Sube cualquier ePOD y ve el mapa al instante — sin necesidad de un bloque de ruta.",
      },
    ],
  }),
  component: VisualPage,
});

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function VisualPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EpodParseResult | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = await parseEpodFile(file);
      setResult(parsed);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setLoading(false);
    }
  }

  const points: VisualPoint[] = useMemo(() => {
    if (!result) return [];
    const located: VisualPoint[] = [];
    for (const row of result.rows) {
      if (row.lat === null || row.lon === null) continue;
      located.push({
        waybill: row.waybill,
        lat: row.lat,
        lon: row.lon,
        address: row.address,
        zip: row.zip,
        taskStatus: row.taskStatus,
        status: classifyVisualStatus(row.taskStatus),
        driverName: row.driverName,
      });
    }
    return located;
  }, [result]);

  const withoutCoords = result ? result.rows.length - points.length : 0;
  const counts = useMemo(() => {
    const c = { delivered: 0, failed: 0, received: 0, other: 0 };
    for (const p of points) c[p.status] += 1;
    return c;
  }, [points]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8 lg:max-w-6xl">
      <AdminNav />

      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Visual</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-foreground">Mapa rápido</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Sube cualquier ePOD y ve el mapa al instante — no depende de ningún bloque de ruta creado.
        </p>
      </header>

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
        className={`mb-4 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-6 text-center transition-colors ${
          dragging ? "border-accent bg-accent/10" : "border-border bg-card"
        }`}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <span className="text-base font-bold text-foreground">
          {loading ? "Procesando…" : result ? `${result.fileName} — subir otro` : "Toca o arrastra un ePOD"}
        </span>
        <span className="text-sm text-muted-foreground">EPOD_TASK_LIST_V2… (.xlsx / .xls / .csv)</span>
      </button>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!result && !loading && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-10 text-center">
          <Eye className="h-8 w-8 text-muted-foreground" />
          <p className="text-base font-semibold text-foreground">Sube un ePOD para ver el mapa</p>
        </div>
      )}

      {result && (
        <>
          <section className="mb-4 grid grid-cols-3 gap-3">
            <CounterCard
              icon={<CheckCircle2 className="h-6 w-6" />}
              label="Entregados"
              count={counts.delivered}
              percent={pct(counts.delivered, points.length)}
              className="bg-success/15 text-success"
            />
            <CounterCard
              icon={<XCircle className="h-6 w-6" />}
              label="Fallados"
              count={counts.failed}
              percent={pct(counts.failed, points.length)}
              className="bg-destructive/15 text-destructive"
            />
            <CounterCard
              icon={<Truck className="h-6 w-6" />}
              label="Recibidos"
              count={counts.received}
              percent={pct(counts.received, points.length)}
              className="bg-pending/15 text-pending"
            />
          </section>

          {(counts.other > 0 || withoutCoords > 0) && (
            <p className="mb-4 text-sm text-muted-foreground">
              {counts.other > 0 && `${counts.other} en otro estado (gris)`}
              {counts.other > 0 && withoutCoords > 0 && " · "}
              {withoutCoords > 0 && `${withoutCoords} sin coordenadas (no se muestran en el mapa)`}
            </p>
          )}

          <Suspense fallback={<div className="h-[70vh] w-full animate-pulse rounded-xl bg-secondary" />}>
            <VisualMap points={points} className="h-[70vh] w-full rounded-xl border border-border lg:h-[calc(100vh-18rem)]" />
          </Suspense>

          {points.length === 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-pending/10 p-3 text-sm font-semibold text-pending">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0" />
              <span>Ningún paquete de este archivo trae coordenadas — no hay nada que mostrar en el mapa.</span>
            </div>
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
