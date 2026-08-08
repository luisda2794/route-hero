import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Footprints, ShieldCheck, Truck, WifiOff } from "lucide-react";
import { lookupPackagePublic, type LookupResult } from "@/lib/assignment";
import { BarcodeScanner } from "@/components/barcode-scanner";

export const Route = createFileRoute("/consulta")({
  head: () => ({
    meta: [
      { title: "RutaFacil — Consulta tu paquete" },
      {
        name: "description",
        content: "Escanea el código de tu paquete para saber a qué área y conductor fue asignado.",
      },
    ],
  }),
  component: ConsultaPage,
});

function playFeedback(kind: "success" | "error") {
  navigator.vibrate?.(kind === "success" ? 80 : 200);
}

function ConsultaPage() {
  const [mounted, setMounted] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [queriedWaybill, setQueriedWaybill] = useState("");
  const lastScanRef = useRef<{ text: string; at: number } | null>(null);

  useEffect(() => setMounted(true), []);

  async function runLookup(waybill: string) {
    setLoading(true);
    setQueriedWaybill(waybill);
    const res = await lookupPackagePublic(waybill);
    setResult(res);
    setLoading(false);
    playFeedback(res.kind === "found" ? "success" : "error");
  }

  function handleDetected(rawText: string) {
    const text = rawText.trim();
    if (!text || loading) return;
    const now = Date.now();
    const last = lastScanRef.current;
    if (last && last.text === text && now - last.at < 3000) return;
    lastScanRef.current = { text, at: now };
    void runLookup(text);
  }

  function handleManualSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = manualInput.trim();
    if (!text) return;
    void runLookup(text);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Consulta pública</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-foreground">¿Dónde va mi paquete?</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Escanea o escribe el número de guía (waybill) de tu paquete para saber a qué área fue asignado.
        </p>
      </header>

      <section className="mb-4">
        {mounted ? (
          <BarcodeScanner onDetected={handleDetected} />
        ) : (
          <div className="aspect-[4/3] w-full animate-pulse rounded-2xl bg-secondary" />
        )}
      </section>

      <form onSubmit={handleManualSubmit} className="mb-4 flex gap-2">
        <input
          type="text"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder="Escribe el número de guía"
          className="min-w-0 flex-1 rounded-xl border-2 border-border bg-card px-4 py-3 text-base font-semibold text-foreground outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 rounded-xl bg-accent px-5 py-3 font-bold text-accent-foreground disabled:opacity-50"
        >
          Buscar
        </button>
      </form>

      <p className="flex items-start gap-2 rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Esta pantalla solo muestra la información del paquete que tú buscas. Ninguna otra persona ni
        ningún otro envío es visible aquí.
      </p>

      {result && (
        <div
          onClick={() => setResult(null)}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center ${
            result.kind === "found" ? "bg-success" : "bg-destructive"
          }`}
        >
          {result.kind === "found" && (
            <>
              <p className="text-2xl font-bold text-success-foreground/80">Tu paquete va con</p>
              <p className="text-4xl font-black text-success-foreground">{result.info.zoneName}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="flex items-center gap-1 rounded-full bg-success-foreground/20 px-3 py-1 text-sm font-black uppercase tracking-wide text-success-foreground">
                  {result.info.driverType === "andarin" ? (
                    <Footprints className="h-4 w-4" />
                  ) : (
                    <Truck className="h-4 w-4" />
                  )}
                  {result.info.driverType === "andarin" ? "Andarín" : "Repartidor"}
                </span>
                {result.info.isPudo && (
                  <span className="rounded-full bg-success-foreground/20 px-3 py-1 text-sm font-black uppercase tracking-wide text-success-foreground">
                    Punto PUDO
                  </span>
                )}
              </div>
              <p className="mt-4 text-3xl font-black text-success-foreground">
                Parada {result.info.stopNumber} de {result.info.totalStops}
              </p>
              <p className="mt-4 text-lg font-semibold text-success-foreground/90">
                CP {result.info.zip} · {result.info.address || "—"}
              </p>
            </>
          )}
          {result.kind === "not-found" && (
            <>
              <AlertTriangle className="h-14 w-14 text-destructive-foreground" />
              <p className="mt-4 text-3xl font-black text-destructive-foreground">
                No encontramos ese paquete
              </p>
              <p className="mt-2 text-lg font-semibold text-destructive-foreground/90">
                Verifica el número de guía — {queriedWaybill}
              </p>
            </>
          )}
          {result.kind === "error" && (
            <>
              <WifiOff className="h-14 w-14 text-destructive-foreground" />
              <p className="mt-4 text-3xl font-black text-destructive-foreground">Error de conexión</p>
              <p className="mt-2 text-lg font-semibold text-destructive-foreground/90">
                Intenta de nuevo en unos segundos.
              </p>
            </>
          )}
          <p className="mt-8 text-sm text-white/70">Toca para buscar otro paquete</p>
        </div>
      )}
    </main>
  );
}
