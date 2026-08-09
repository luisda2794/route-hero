import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, PackageSearch } from "lucide-react";
import {
  parseEpodFile,
  summarizeByZipAndType,
  type EpodParseResult,
  type EpodRow,
  type ColumnKey,
} from "@/lib/epod";
import { buildZonesByZip, type DriverType, type ZipGroup } from "@/lib/clustering";
import { buildAssignments, saveAssignments, saveAssignmentsRemote } from "@/lib/assignment";
import { ZonesPreview } from "@/components/zones-preview";
import { AdminNav } from "@/components/admin-nav";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RutaFacil — Configuración del día" },
      {
        name: "description",
        content:
          "Sube el ePOD del día, indica en cuántas áreas quieres dividir cada Código Postal y calcula las zonas de reparto.",
      },
      { property: "og:title", content: "RutaFacil — Configuración del día" },
      {
        property: "og:description",
        content: "Sube el ePOD y define en cuántas áreas dividir cada Código Postal.",
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
  const [driverTypesByZip, setDriverTypesByZip] = useState<Record<string, DriverType[]>>({});
  const [pudoEnabled, setPudoEnabled] = useState(false);
  const [pudoDrivers, setPudoDrivers] = useState("");
  const [step, setStep] = useState<"setup" | "zones">("setup");
  const [zipGroups, setZipGroups] = useState<ZipGroup[]>([]);
  const [pudoGroup, setPudoGroup] = useState<ZipGroup | null>(null);
  const [unlocatedRows, setUnlocatedRows] = useState<EpodRow[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [remoteSaveStatus, setRemoteSaveStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");

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

  const total = result?.totalToRoute ?? 0;
  const zipSummary = result ? summarizeByZipAndType(result.inDeliveryRows) : [];
  const totalPudo = zipSummary.reduce((sum, z) => sum + z.pudoCount, 0);
  const nPudoDrivers = pudoEnabled ? Number(pudoDrivers) || 0 : 0;
  const pudoPerArea = nPudoDrivers > 0 ? Math.round((totalPudo / nPudoDrivers) * 10) / 10 : null;
  const canCalculate = Boolean(
    result &&
      total > 0 &&
      (Object.values(driversByZip).some((v) => Number(v) > 0) || nPudoDrivers > 0),
  );

  function updateDriverType(zip: string, index: number, type: DriverType) {
    setDriverTypesByZip((prev) => {
      const next = [...(prev[zip] ?? [])];
      next[index] = type;
      return { ...prev, [zip]: next };
    });
  }

  function handleCalculate() {
    if (!result) return;
    const driverTypeConfigs: Record<string, DriverType[]> = {};
    for (const [zip, value] of Object.entries(driversByZip)) {
      const n = Number(value);
      if (n <= 0) continue;
      const types = driverTypesByZip[zip] ?? [];
      driverTypeConfigs[zip] = Array.from({ length: n }, (_, i) => types[i] ?? "repartidor");
    }
    const { groups, pudoGroup: computedPudoGroup, unlocated } = buildZonesByZip(
      result.inDeliveryRows,
      driverTypeConfigs,
      nPudoDrivers,
    );
    setZipGroups(groups);
    setPudoGroup(computedPudoGroup);
    setUnlocatedRows(unlocated);
    setConfirmed(false);
    setStep("zones");
  }

  function handleConfirm() {
    const allGroups = pudoGroup ? [...zipGroups, pudoGroup] : zipGroups;
    const assignments = buildAssignments(allGroups);
    saveAssignments(assignments);
    setConfirmed(true);

    setRemoteSaveStatus("saving");
    void saveAssignmentsRemote(assignments).then((ok) => setRemoteSaveStatus(ok ? "ok" : "error"));
  }

  if (step === "zones" && result) {
    return (
      <ZonesPreview
        groups={zipGroups}
        pudoGroup={pudoGroup}
        unlocated={unlocatedRows}
        onGroupsChange={setZipGroups}
        onPudoGroupChange={setPudoGroup}
        onBack={() => setStep("setup")}
        onConfirm={handleConfirm}
        confirmed={confirmed}
        remoteSaveStatus={remoteSaveStatus}
      />
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8">
      <AdminNav />

      <Link
        to="/consulta"
        className="mb-6 flex items-center gap-3 rounded-2xl border-2 border-accent bg-accent/10 px-4 py-3.5 text-accent"
      >
        <PackageSearch className="h-6 w-6 shrink-0" />
        <span className="text-left">
          <span className="block text-base font-black leading-tight">¿Buscas tu paquete?</span>
          <span className="block text-sm font-semibold leading-tight text-accent/80">
            Consulta pública — sin necesidad de cuenta
          </span>
        </span>
      </Link>

      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Paso 1 de 4</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-foreground">RUTAFACIL</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Configuración del día. El ePOD se procesa en tu teléfono; al confirmar las zonas se guarda
          también una copia en la nube para la consulta pública.
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
              <Stat label="Fecha más reciente" value={result.latestDate || "—"} />
              <Stat label="Filas en archivo" value={String(result.rows.length)} />
              <Stat label="A enrutar" value={String(result.totalToRoute)} highlight />
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
                Estados en el archivo
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
          <h2 className="text-lg font-bold text-foreground">2. Áreas por Código Postal</h2>
          <p className="text-sm text-muted-foreground">
            Deja en blanco o en 0 los CP que no repartes hoy — no se les generarán áreas. El
            número de áreas aplica solo a los paquetes a domicilio.
          </p>
          <div className="space-y-3">
            {zipSummary.map(({ zip, homeCount, pudoCount }) => {
              const value = driversByZip[zip] ?? "";
              const n = Number(value) || 0;
              const perArea = n > 0 ? Math.round((homeCount / n) * 10) / 10 : null;
              return (
                <div key={zip} className="rounded-2xl bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black text-foreground">{zip}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                        <span>{homeCount} a domicilio</span>
                        {pudoCount > 0 && (
                          <span className="font-semibold text-accent">{pudoCount} PUDO</span>
                        )}
                      </div>
                    </div>
                    <label className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs font-semibold text-muted-foreground">¿En cuántas áreas?</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={value}
                        placeholder="0"
                        onChange={(e) =>
                          setDriversByZip((prev) => ({ ...prev, [zip]: e.target.value }))
                        }
                        className="w-20 rounded-xl border-2 border-border bg-background px-3 py-3 text-center text-xl font-bold text-foreground outline-none focus:border-accent"
                      />
                    </label>
                  </div>
                  {perArea !== null && (
                    <p className="mt-2 text-sm font-semibold text-accent">
                      ~{perArea} paquetes por área
                    </p>
                  )}
                  {n > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Array.from({ length: n }, (_, i) => {
                        const currentType = driverTypesByZip[zip]?.[i] ?? "repartidor";
                        return (
                          <select
                            key={i}
                            value={currentType}
                            onChange={(e) => updateDriverType(zip, i, e.target.value as DriverType)}
                            className="rounded-lg border-2 border-border bg-background px-2 py-1.5 text-sm font-semibold text-foreground outline-none focus:border-accent"
                          >
                            <option value="repartidor">C{i + 1}: Repartidor</option>
                            <option value="andarin">C{i + 1}: Andarín</option>
                          </select>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {totalPudo > 0 && (
        <section className="mb-6 space-y-3">
          <label className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-sm">
            <input
              type="checkbox"
              checked={pudoEnabled}
              onChange={(e) => setPudoEnabled(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-accent"
            />
            <span className="text-base font-bold text-foreground">
              Incluir ruta PUDO ({totalPudo} paquetes)
            </span>
          </label>
          {pudoEnabled && (
            <div className="rounded-2xl bg-card p-4 shadow-sm">
              <label className="block">
                <span className="text-base font-bold text-foreground">
                  ¿En cuántas áreas quieres dividir la ruta PUDO?
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={pudoDrivers}
                  placeholder="Ej. 1"
                  onChange={(e) => setPudoDrivers(e.target.value)}
                  className="mt-2 w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-xl font-bold text-foreground outline-none focus:border-accent"
                />
              </label>
              {pudoPerArea !== null && (
                <p className="mt-2 text-sm font-semibold text-accent">
                  ~{pudoPerArea} paquetes por área
                </p>
              )}
            </div>
          )}
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
          Sube el ePOD e indica áreas para al menos un Código Postal.
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
