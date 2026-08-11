import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, AlertTriangle, LayoutDashboard, PlusCircle, ScanLine, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/" as const, label: "Dashboard", icon: LayoutDashboard },
  { to: "/nuevo" as const, label: "Nuevo bloque", icon: PlusCircle },
  { to: "/escanear" as const, label: "Escanear", icon: ScanLine },
  { to: "/conductor" as const, label: "Conductor", icon: UserRound },
  { to: "/seguimiento" as const, label: "Seguimiento", icon: Activity },
  { to: "/priorizar" as const, label: "Priorizar", icon: AlertTriangle },
];

/** Shared nav across the internal/admin screens — not shown on the public /consulta page. */
export function AdminNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="mb-6 flex gap-1.5 overflow-x-auto rounded-xl border border-border bg-card p-1.5">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.to;
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
