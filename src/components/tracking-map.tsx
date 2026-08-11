import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TrackedPackage } from "@/lib/tracking";
import type { TrackingStatus } from "@/lib/epod";

const MADRID_CENTER: LatLngExpression = [40.4168, -3.7038];

// Literal colors (not CSS vars) — Leaflet's SVG/canvas renderer needs a
// resolvable color value, same reasoning as zones-map.tsx.
const STATUS_COLORS: Record<TrackingStatus, string> = {
  delivered: "#16a34a",
  failed: "#dc2626",
  pending: "#2563eb",
};

const STATUS_LABELS: Record<TrackingStatus, string> = {
  delivered: "Entregado",
  failed: "Fallado",
  pending: "Pendiente",
};

function FitBounds({ points }: { points: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
  }, [map, points]);
  return null;
}

/** Client-only Leaflet map — must be lazy-loaded, never imported during SSR. */
export default function TrackingMap({
  packages,
  className = "h-[28rem] w-full rounded-xl border border-border",
}: {
  packages: TrackedPackage[];
  className?: string;
}) {
  const located = packages.filter(
    (p): p is TrackedPackage & { lat: number; lon: number } => p.lat !== null && p.lon !== null,
  );
  const allPoints: LatLngExpression[] = located.map((p) => [p.lat, p.lon]);

  return (
    <MapContainer center={allPoints[0] ?? MADRID_CENTER} zoom={12} scrollWheelZoom className={className}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
        maxZoom={19}
      />
      {located.map((p) => (
        <CircleMarker
          key={p.waybill}
          center={[p.lat, p.lon]}
          radius={7}
          pathOptions={{ color: STATUS_COLORS[p.status], fillColor: STATUS_COLORS[p.status], fillOpacity: 0.85, weight: 1 }}
        >
          <Popup>
            <strong>{p.waybill}</strong>
            <br />
            Conductor {p.driverNumber} — {p.zoneName}
            <br />
            Parada {p.stopNumber} de {p.totalStops}
            <br />
            CP {p.zip}
            {p.address && (
              <>
                <br />
                {p.address}
              </>
            )}
            <br />
            Estado: {STATUS_LABELS[p.status]} ({p.taskStatus || "—"})
          </Popup>
        </CircleMarker>
      ))}
      <FitBounds points={allPoints} />
    </MapContainer>
  );
}
