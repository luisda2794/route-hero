import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Footprints, PackageSearch, Truck } from "lucide-react";
import { getActiveBlockOrMostRecent, syncBlocksFromRemote, type RoutingBlock } from "@/lib/blocks";
import { allDriverProgress } from "@/lib/driver";
import { colorForDriverNumber } from "@/lib/clustering";
import { AdminNav } from "@/components/admin-nav";
import { usePollRemoteSync } from "@/hooks/use-poll-remote-sync";

export const Route = createFileRoute("/conductor/")({
  head: () => ({
    meta: [
      { title: "RutaFacil — Conductor" },
      {
        name: "description",
        content: "Elige tu número de conductor para ver tus paradas y marcar entregas.",
      },
    ],
  }),
  component: ConductorIndexPage,
});

function ConductorIndexPage() {
  const [mounted, setMounted] = useState(false);
  const [activeBlock, setActiveBlock] = useState<RoutingBlock | null>(null);

  useEffect(() => {
    setMounted(true);
    setActiveBlock(getActiveBlockOrMostRecent());
    void syncBlocksFromRemote().then((changed) => {
      if (changed) setActiveBlock(getActiveBlockOrMostRecent());
    });
  }, []);

  usePollRemoteSync(() => setActiveBlock(getActiveBlockOrMostRecent()));

  const drivers = activeBlock ? allDriverProgress(activeBlock) : [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8">
      <AdminNav />

      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Conductor</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight text-foreground">
          {activeBlock ? activeBlock.name : "Conductor"}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Elige tu número de conductor para ver tus paradas y marcar entregas.
        </p>
      </header>

      {mounted && !activeBlock && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-lg font-bold text-foreground">No hay ningún bloque activo</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Crea un bloque nuevo o elige uno en el Dashboard antes de entrar a tu vista de conductor.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/nuevo" className="inline-block rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">
              Crear bloque
            </Link>
            <Link to="/" className="inline-block rounded-xl border border-border bg-card px-5 py-3 font-bold text-foreground">
              Ir al Dashboard
            </Link>
          </div>
        </div>
      )}

      {mounted && activeBlock && drivers.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-6 text-center">
          <PackageSearch className="h-8 w-8 text-muted-foreground" />
          <p className="text-base font-semibold text-foreground">Este bloque no tiene conductores con paradas.</p>
        </div>
      )}

      <div className="space-y-3">
        {drivers.map((driver) => {
          const done = driver.delivered + driver.failed;
          return (
            <Link
              key={driver.driverNumber}
              to="/conductor/$driverNumber"
              params={{ driverNumber: String(driver.driverNumber) }}
              className="block rounded-xl border border-border bg-card p-3 transition-colors active:bg-secondary"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForDriverNumber(driver.driverNumber) }}
                  aria-hidden
                />
                {driver.driverType === "andarin" ? (
                  <Footprints className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                  Conductor {driver.driverNumber} — {driver.zoneName}
                </span>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {done}/{driver.total}
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
                {driver.delivered > 0 && (
                  <div className="h-full bg-success" style={{ width: `${(driver.delivered / driver.total) * 100}%` }} />
                )}
                {driver.failed > 0 && (
                  <div
                    className="h-full bg-destructive"
                    style={{ width: `${(driver.failed / driver.total) * 100}%` }}
                  />
                )}
                {driver.pending > 0 && (
                  <div className="h-full bg-pending" style={{ width: `${(driver.pending / driver.total) * 100}%` }} />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
