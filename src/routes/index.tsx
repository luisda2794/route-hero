import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { parseEpodFile, type EpodParseResult, type ColumnKey } from "@/lib/epod";
import { buildZones, type Zone } from "@/lib/clustering";
import { ZonesPreview } from "@/components/zones-preview";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RutaFacil — Configuración del día" },
      {
        name: "description",
        content:
          "Sube el ePOD del día, indica cuántos conductores tienes y calcula las zonas de reparto.",
      },
      { property: "og:title", content: "RutaFacil — Configuración del día" },
      {
        property: "og:description",
        content: "Sube el ePOD, define conductores y paquetes por conductor.",
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
  const [drivers, setDrivers] = useState("");
  const [perDriver, setPerDriver] = useState("");
  const [step, setStep] = useState<"setup" | "zones">("setup");
  const [zones, setZones] = useState<Zone[]>([]);
  const [targetSize, setTargetSize] = useState(0);
  const [savedAssignment, setSavedAssignment] = useState<Record<string, string> | null>(null);

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
  const nDrivers = Number(drivers) || 0;
  const nPerDriver = Number(perDriver) || 0;
  const suggestedZones = total && nPerDriver ? Math.max(1, Math.ceil(total / nPerDriver)) : 0;
  const canCalculate = Boolean(result && total > 0 && nDrivers > 0);

  function handleCalculate() {
    if (!result || nDrivers <= 0) return;
    const { zones: computed, targetSize: target } = buildZones(result.inDeliveryRows, nDrivers);
    setZones(computed);
    setTargetSize(target);
    setSavedAssignment(null);
    setStep("zones");
  }

  function handleConfirm() {
    const assignment: Record<string, string> = {};
    for (const zone of zones) {
      for (const point of zone.points) {
        assignment[point.waybill] = zone.name;
      }
    }
    setSavedAssignment(assignment);
  }

  if (step === "zones" && result) {
    return (
      <ZonesPreview
        zones={zones}
        targetSize={targetSize}
        unlocated={result.inDeliveryRows.filter((r) => r.lat === null || r.lon === null)}
        onZonesChange={setZones}
        onBack={() => setStep("setup")}
        onConfirm={handleConfirm}
        confirmed={savedAssignment !== null}
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

      <section className="mb-6 space-y-4">
        <h2 className="text-lg font-bold text-foreground">2. Conductores y carga</h2>
        <NumberField
          label="¿Cuántos conductores tienes hoy?"
          value={drivers}
          onChange={setDrivers}
          placeholder="Ej. 6"
        />
        <NumberField
          label="¿Cuántos paquetes aprox. por conductor?"
          value={perDriver}
          onChange={setPerDriver}
          placeholder="Ej. 80"
          hint="Orientativo: sirve para sugerir cuántas zonas crear."
        />
        {suggestedZones > 0 && (
          <p className="rounded-xl bg-accent/15 p-3 text-sm font-semibold text-foreground">
            Con {total} paquetes y {nPerDriver} por conductor, se sugieren{" "}
            <span className="text-lg font-black">{suggestedZones}</span> zonas.
          </p>
        )}
      </section>

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
          Sube el ePOD e indica el número de conductores.
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

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-base font-bold text-foreground">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border-2 border-border bg-card px-4 py-4 text-2xl font-bold text-foreground outline-none focus:border-accent"
      />
      {hint && <span className="mt-1 block text-sm text-muted-foreground">{hint}</span>}
    </label>
  );
}
