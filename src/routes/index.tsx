import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { parseEpodFile, summarizeByZip, type EpodParseResult, type EpodRow, type ColumnKey } from "@/lib/epod";
import { buildZonesByZip, type ZipGroup } from "@/lib/clustering";
import { buildAssignments, saveAssignments } from "@/lib/assignment";
import { ZonesPreview } from "@/components/zones-preview";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RutaFacil — Configuración del día" },
      {
        name: "description",
        content:
          "Sube el ePOD del día, indica cuántos conductores quieres por Código Postal y calcula las zonas de reparto.",
      },
      { property: "og:title", content: "RutaFacil — Configuración del día" },
      {
        property: "og:description",
        content: "Sube el ePOD y define conductores por Código Postal.",
      },
    ],
  }),
  component: SetupPage,
});

const COLUMN_LABELS: Record<ColumnKey, string> = {
  waybill: "Número de Waybill",
  taskStatus: "Estado de la Tarea",
  zip: "Código postal",
  address: "Dirección detallada",
  lat: "Latitud",
  lon: "Longitud",
  taskDate: "Fecha de la tarea",
};

function SetupPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EpodParseResult | null>(null);
  const [driversByZip, setDriversByZip] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"setup" | "zones">("setup");
  const [zipGroups, setZipGroups] = useState<ZipGroup[]>([]);
  const [unlocatedRows, setUnlocatedRows] = useState<EpodRow[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const parsed = await parseEpodFile(file);
      setResult(parsed);
      if (parsed.missing.length) {
        setError(
          `No se reconocieron estas columnas: ${parsed.missing.map((m) => COLUMN_LABELS[m]).join(", ")}`,
        );
      }
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setLoading(false);
    }
  }

  const total = result?.inDeliveryToday ?? 0;
  const zipSummary = result ? summarizeByZip(result.inDeliveryRows) : [];
  const canCalculate = Boolean(
    result && total > 0 && Object.values(driversByZip).some((v) => Number(v) > 0),
  );

  function handleCalculate() {
    if (!result) return;
    const driverCounts: Record<string, number> = {};
    for (const [zip, value] of Object.entries(driversByZip)) {
      const n = Number(value);
      if (n > 0) driverCounts[zip] = n;
    }
    const { groups, unlocated } = buildZonesByZip(result.inDeliveryRows, driverCounts);
    setZipGroups(groups);
    setUnlocatedRows(unlocated);
    setConfirmed(false);
    setStep("zones");
  }

  function handleConfirm() {
    saveAssignments(buildAssignments(zipGroups));
    setConfirmed(true);
  }

  if (step === "zones" && result) {
    return (
      <ZonesPreview
        groups={zipGroups}
        unlocated={unlocatedRows}
        onGroupsChange={setZipGroups}
        onBack={() => setStep("setup")}
        onConfirm={handleConfirm}
        confirmed={confirmed}
      />
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Paso 1 de 4</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-foreground">RUTAFACIL</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Configuración del día. Todo se procesa en tu teléfono, sin servidores.
        </p>
      </header>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-bold text-foreground">1. ePOD del día</h2>
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
          className={`flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? "border-accent bg-accent/10" : "border-border bg-card"
          }`}
        >
          {loading ? (
            <Loader2 className="h-10 w-10 animate-spin text-accent" />
          ) : result ? (
            <FileSpreadsheet className="h-10 w-10 text-success" />
          ) : (
            <Upload className="h-10 w-10 text-muted-foreground" />
          )}
          <span className="text-lg font-bold text-foreground">
            {result ? result.fileName : "Toca o arrastra el Excel"}
          </span>
          <span className="text-sm text-muted-foreground">
            EPOD_TASK_LIST_V2… (.xlsx / .xls / .csv)
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-4 rounded-2xl bg-card p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Fecha detectada" value={result.latestDate || "—"} />
              <Stat label="Filas en archivo" value={String(result.rows.length)} />
              <Stat label="En reparto hoy" value={String(result.inDeliveryToday)} highlight />
              <Stat label="Sin coordenadas" value={String(result.withoutCoords)} />
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Columnas reconocidas
              </p>
              <ul className="space-y-1 text-sm">
                {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((key) => (
                  <li key={key} className="flex items-center gap-2">
                    {result.columns[key] ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <span className="font-semibold text-foreground">{COLUMN_LABELS[key]}</span>
                    <span className="truncate text-muted-foreground">
                      {result.columns[key] ? `→ ${result.columns[key]}` : "no encontrada"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Estados en la fecha detectada
              </p>
              <ul className="space-y-1 text-sm">
                {Object.entries(result.statusCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <li key={status} className="flex justify-between gap-2">
                      <span className="truncate text-muted-foreground">{status}</span>
                      <span className="font-bold text-foreground">{count}</span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {zipSummary.length > 0 && (
        <section className="mb-6 space-y-3">
          <h2 className="text-lg font-bold text-foreground">2. Conductores por Código Postal</h2>
          <p className="text-sm text-muted-foreground">
            Deja en blanco o en 0 los CP que no repartes hoy — no se les generarán zonas.
          </p>
          <div className="space-y-3">
            {zipSummary.map(({ zip, count }) => {
              const value = driversByZip[zip] ?? "";
              const n = Number(value) || 0;
              const perDriver = n > 0 ? Math.round((count / n) * 10) / 10 : null;
              return (
                <div key={zip} className="rounded-2xl bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black text-foreground">{zip}</p>
                      <p className="text-sm text-muted-foreground">{count} paquetes</p>
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={value}
                      placeholder="0"
                      onChange={(e) =>
                        setDriversByZip((prev) => ({ ...prev, [zip]: e.target.value }))
                      }
                      className="w-20 shrink-0 rounded-xl border-2 border-border bg-background px-3 py-3 text-center text-xl font-bold text-foreground outline-none focus:border-accent"
                    />
                  </div>
                  {perDriver !== null && (
                    <p className="mt-2 text-sm font-semibold text-accent">
                      ~{perDriver} paquetes por conductor
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={handleCalculate}
        disabled={!canCalculate}
        className="w-full rounded-2xl bg-primary px-6 py-5 text-xl font-black uppercase tracking-wide text-primary-foreground transition-opacity disabled:opacity-40"
      >
        Calcular zonas
      </button>
      {!canCalculate && (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Sube el ePOD e indica conductores para al menos un Código Postal.
        </p>
      )}
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-accent/20" : "bg-secondary"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black text-foreground">{value}</p>
    </div>
  );
}
