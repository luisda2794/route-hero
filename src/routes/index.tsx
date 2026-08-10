import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Loader2,
  Pencil,
  PackageSearch,
  PlusCircle,
  RefreshCw,
  ScanLine,
  Trash2,
} from "lucide-react";
import {
  listBlocks,
  getActiveBlockOrMostRecent,
  setActiveBlockId,
  renameBlock,
  syncBlockNameToRemote,
  deleteBlock,
  syncBlocksFromRemote,
  blockPackageCount,
  blockDriverCount,
  type RoutingBlock,
} from "@/lib/blocks";
import { assignZoneColors, type Zone } from "@/lib/clustering";
import { AdminNav } from "@/components/admin-nav";

const ZonesMap = lazy(() => import("@/components/zones-map"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RutaFacil — Dashboard" },
      {
        name: "description",
        content: "Bloques de enrutamiento guardados, mapa en vivo y accesos rápidos.",
      },
    ],
  }),
  component: DashboardPage,
});

function formatBlockDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${min}`;
}

function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [blocks, setBlocks] = useState<RoutingBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function refreshFromLocalCache() {
    setBlocks(listBlocks());
    setSelectedId(getActiveBlockOrMostRecent()?.id ?? null);
  }

  async function syncNow() {
    setSyncing(true);
    await syncBlocksFromRemote();
    refreshFromLocalCache();
    setSyncing(false);
  }

  useEffect(() => {
    setMounted(true);
    refreshFromLocalCache(); // instant paint from cache…
    void syncNow(); // …then refresh with whatever the rest of the team has saved
  }, []);

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null;

  const allZones: Zone[] = useMemo(() => {
    if (!selectedBlock) return [];
    const groups = selectedBlock.pudoGroup
      ? [...selectedBlock.groups, selectedBlock.pudoGroup]
      : selectedBlock.groups;
    return groups.flatMap((g) => g.zones).filter((z) => z.points.length > 0);
  }, [selectedBlock]);

  const zoneColors = useMemo(() => {
    if (!selectedBlock) return {};
    const groups = selectedBlock.pudoGroup
      ? [...selectedBlock.groups, selectedBlock.pudoGroup]
      : selectedBlock.groups;
    return assignZoneColors(groups);
  }, [selectedBlock]);

  function handleSelect(id: string) {
    setSelectedId(id);
    setActiveBlockId(id);
    setConfirmingDelete(false);
  }

  function handleRename(id: string, name: string) {
    renameBlock(id, name);
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, name } : b)));
  }

  function handleDelete(id: string) {
    deleteBlock(id);
    const remaining = blocks.filter((b) => b.id !== id);
    setBlocks(remaining);
    setSelectedId(remaining[0]?.id ?? null);
    setConfirmingDelete(false);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 pb-16 pt-8 lg:max-w-6xl">
      <AdminNav />

      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Dashboard</p>
          <h1 className="mt-1 text-4xl font-black tracking-tight text-foreground">RUTAFACIL</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Bloques de enrutamiento compartidos por todo el equipo, desde cualquier dispositivo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={syncing}
          aria-label="Actualizar bloques"
          className="mt-1 flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground disabled:opacity-60"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </button>
      </header>

      {mounted && blocks.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-lg font-bold text-foreground">Todavía no hay bloques guardados</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Sube un ePOD y confirma las zonas para crear tu primer bloque de enrutamiento.
          </p>
          <Link
            to="/nuevo"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground"
          >
            <PlusCircle className="h-5 w-5" />
            Crear bloque
          </Link>
        </div>
      )}

      {blocks.length > 0 && (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {blocks.map((block) => {
              const active = block.id === selectedId;
              return (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => handleSelect(block.id)}
                  className={`flex shrink-0 flex-col items-start gap-0.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  <span className="text-sm font-bold">{block.name}</span>
                  <span className={`text-xs ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {formatBlockDate(block.createdAt)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section>
              {mounted ? (
                <Suspense
                  fallback={<div className="h-[70vh] w-full animate-pulse rounded-xl bg-secondary" />}
                >
                  <ZonesMap
                    zones={allZones}
                    colors={zoneColors}
                    className="h-[70vh] w-full rounded-xl border border-border lg:h-[calc(100vh-14rem)]"
                  />
                </Suspense>
              ) : (
                <div className="h-[70vh] w-full animate-pulse rounded-xl bg-secondary" />
              )}
            </section>

            <aside className="flex flex-col gap-4">
              {selectedBlock && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <label className="mb-3 flex items-center gap-2">
                    <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                      type="text"
                      value={selectedBlock.name}
                      onChange={(e) => handleRename(selectedBlock.id, e.target.value)}
                      onBlur={() => syncBlockNameToRemote(selectedBlock.id)}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-bold text-foreground outline-none focus:border-accent"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-secondary p-3">
                      <p className="text-2xl font-black text-foreground">
                        {blockPackageCount(selectedBlock)}
                      </p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Paquetes
                      </p>
                    </div>
                    <div className="rounded-lg bg-secondary p-3">
                      <p className="text-2xl font-black text-foreground">
                        {blockDriverCount(selectedBlock)}
                      </p>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Conductores
                      </p>
                    </div>
                  </div>

                  <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Conductores / áreas
                  </p>
                  <div className="max-h-72 space-y-1 overflow-y-auto">
                    {allZones
                      .slice()
                      .sort((a, b) => a.driverNumber - b.driverNumber)
                      .map((zone) => (
                        <Link
                          key={zone.id}
                          to="/conductor/$driverNumber"
                          params={{ driverNumber: String(zone.driverNumber) }}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary"
                        >
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: zoneColors[zone.id] ?? "#9ca3af" }}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                            {zone.name}
                          </span>
                          <span className="shrink-0 text-xs font-bold text-muted-foreground">
                            {zone.points.length}
                          </span>
                        </Link>
                      ))}
                  </div>

                  <div className="mt-4">
                    {confirmingDelete ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleDelete(selectedBlock.id)}
                          className="flex-1 rounded-xl bg-destructive px-4 py-2.5 text-sm font-bold text-destructive-foreground"
                        >
                          Sí, eliminar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(false)}
                          className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 px-4 py-2.5 text-sm font-bold text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar bloque
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Link
                  to="/nuevo"
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground"
                >
                  <PlusCircle className="h-5 w-5" />
                  Nuevo bloque
                </Link>
                <Link
                  to="/escanear"
                  className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 font-bold text-foreground"
                >
                  <ScanLine className="h-5 w-5" />
                  Ir a Escaneo
                </Link>
                <Link
                  to="/seguimiento"
                  className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 font-bold text-foreground"
                >
                  <Activity className="h-5 w-5" />
                  Ir a Seguimiento
                </Link>
                <Link
                  to="/consulta"
                  className="flex items-center justify-center gap-2 rounded-xl border border-accent bg-accent/10 px-4 py-3 font-bold text-accent"
                >
                  <PackageSearch className="h-5 w-5" />
                  Consulta pública
                </Link>
              </div>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

