import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, ChevronDown, RotateCcw } from "lucide-react";
import {
  loadAssignments,
  loadScanState,
  saveScanState,
  resetScanState,
  type SavedAssignments,
  type ScanState,
  type WaybillAssignment,
} from "@/lib/assignment";
import { BarcodeScanner } from "@/components/barcode-scanner";

export const Route = createFileRoute("/escanear")({
  head: () => ({
    meta: [
      { title: "RutaFacil — Escaneo" },
      {
        name: "description",
        content: "Escanea los waybills en el almacén y verifica conductor y parada.",
      },
    ],
  }),
  component: ScanPage,
});

type ScanResult =
  | { kind: "found-new"; assignment: WaybillAssignment }
  | { kind: "found-duplicate"; assignment: WaybillAssignment }
  | { kind: "not-found"; text: string };

function playFeedback(kind: "success" | "warning" | "error") {
  navigator.vibrate?.(kind === "success" ? 80 : kind === "warning" ? [60, 40, 60] : 200);
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = kind === "success" ? 880 : kind === "warning" ? 440 : 220;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // audio not available — vibration/visual feedback still happened
  }
}

function ScanPage() {
  const [mounted, setMounted] = useState(false);
  const [assignments, setAssignments] = useState<SavedAssignments | null>(null);
  const [scanState, setScanState] = useState<ScanState>({ scanned: {} });
  const [manualInput, setManualInput] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const lastScanRef = useRef<{ text: string; at: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    setAssignments(loadAssignments());
    setScanState(loadScanState());
  }, []);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 2500);
    return () => clearTimeout(t);
  }, [result]);

  const driverProgress = useMemo(() => {
    if (!assignments) return [];
    const scannedByDriver: Record<number, number> = {};
    for (const waybill of Object.keys(scanState.scanned)) {
      const a = assignments.byWaybill[waybill];
      if (a) scannedByDriver[a.driverNumber] = (scannedByDriver[a.driverNumber] ?? 0) + 1;
    }
    return Object.entries(assignments.driverTotals)
      .map(([driverNumberStr, total]) => ({
        driverNumber: Number(driverNumberStr),
        total,
        scanned: scannedByDriver[Number(driverNumberStr)] ?? 0,
      }))
      .sort((a, b) => a.driverNumber - b.driverNumber);
  }, [assignments, scanState]);

  const totalScanned = Object.keys(scanState.scanned).length;
  const totalPackages = assignments ? Object.keys(assignments.byWaybill).length : 0;

  function processWaybill(waybill: string) {
    if (!assignments) return;
    const assignment = assignments.byWaybill[waybill];
    if (!assignment) {
      setResult({ kind: "not-found", text: waybill });
      playFeedback("error");
      return;
    }
    if (scanState.scanned[waybill]) {
      setResult({ kind: "found-duplicate", assignment });
      playFeedback("warning");
      return;
    }
    const nextScanState: ScanState = {
      scanned: { ...scanState.scanned, [waybill]: { scannedAt: new Date().toISOString() } },
    };
    setScanState(nextScanState);
    saveScanState(nextScanState);
    setResult({ kind: "found-new", assignment });
    playFeedback("success");
  }

  function handleDetected(rawText: string) {
    const text = rawText.trim();
    if (!text) return;
    const now = Date.now();
    const last = lastScanRef.current;
    if (last && last.text === text && now - last.at < 3000) return;
    lastScanRef.current = { text, at: now };
    processWaybill(text);
  }

  function handleManualSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = manualInput.trim();
    if (!text) return;
    processWaybill(text);
    setManualInput("");
  }

  function handleResetScan() {
    resetScanState();
    setScanState({ scanned: {} });
    setResult(null);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Paso 4 de 4</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-foreground">Escaneo</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Escanea el waybill de cada paquete para confirmar conductor y parada.
        </p>
      </header>

      {mounted && !assignments && (
        <div className="rounded-2xl bg-card p-6 text-center shadow-sm">
          <p className="text-lg font-bold text-foreground">No hay zonas guardadas todavía</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Vuelve al Paso 1, calcula las zonas y confirma para empezar a escanear.
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
          <button
            type="button"
            onClick={() => setProgressOpen((v) => !v)}
            className="mb-4 flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 shadow-sm"
          >
            <span className="font-bold text-foreground">
              Progreso: {totalScanned}/{totalPackages} escaneados
            </span>
            <ChevronDown className={`h-5 w-5 transition-transform ${progressOpen ? "rotate-180" : ""}`} />
          </button>
          {progressOpen && (
            <div className="mb-4 max-h-56 space-y-1 overflow-y-auto rounded-2xl bg-card p-3 shadow-sm">
              {driverProgress.map((d) => (
                <div key={d.driverNumber} className="flex justify-between text-sm">
                  <span className="font-semibold text-foreground">Conductor {d.driverNumber}</span>
                  <span className="font-bold text-foreground">
                    {d.scanned}/{d.total} escaneados
                  </span>
                </div>
              ))}
            </div>
          )}

          <section className="mb-4">
            {mounted ? (
              <BarcodeScanner onDetected={handleDetected} />
            ) : (
              <div className="aspect-[4/3] w-full animate-pulse rounded-2xl bg-secondary" />
            )}
          </section>

          <form onSubmit={handleManualSubmit} className="mb-6 flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Escribe el número de waybill"
              className="min-w-0 flex-1 rounded-xl border-2 border-border bg-card px-4 py-3 text-base font-semibold text-foreground outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-accent px-5 py-3 font-bold text-accent-foreground"
            >
              Buscar
            </button>
          </form>

          <button
            type="button"
            onClick={handleResetScan}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card px-6 py-4 text-lg font-bold text-foreground"
          >
            <RotateCcw className="h-5 w-5" />
            Reiniciar sesión de escaneo
          </button>
        </>
      )}

      {result && (
        <div
          onClick={() => setResult(null)}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-6 text-center ${
            result.kind === "found-new"
              ? "bg-success"
              : result.kind === "found-duplicate"
                ? "bg-warning"
                : "bg-destructive"
          }`}
        >
          {result.kind === "found-new" && (
            <>
              <p className="text-2xl font-bold text-success-foreground/80">Conductor</p>
              <p className="text-8xl font-black text-success-foreground">{result.assignment.driverNumber}</p>
              <p className="mt-4 text-3xl font-black text-success-foreground">
                Parada {result.assignment.stopNumber} de {result.assignment.totalStops}
              </p>
              <p className="mt-4 text-lg font-semibold text-success-foreground/90">
                CP {result.assignment.zip} · {result.assignment.address || "—"}
              </p>
            </>
          )}
          {result.kind === "found-duplicate" && (
            <>
              <AlertTriangle className="h-14 w-14 text-warning-foreground" />
              <p className="mt-2 text-2xl font-bold text-warning-foreground">Ya escaneado antes</p>
              <p className="mt-2 text-4xl font-black text-warning-foreground">
                Parada {result.assignment.stopNumber}, Conductor {result.assignment.driverNumber}
              </p>
            </>
          )}
          {result.kind === "not-found" && (
            <>
              <AlertTriangle className="h-14 w-14 text-destructive-foreground" />
              <p className="mt-4 text-4xl font-black text-destructive-foreground">No encontrado</p>
              <p className="mt-2 text-xl font-semibold text-destructive-foreground/90">
                Verificar — {result.text}
              </p>
            </>
          )}
          <p className="mt-8 text-sm text-white/70">Toca para seguir escaneando</p>
        </div>
      )}
    </main>
  );
}
