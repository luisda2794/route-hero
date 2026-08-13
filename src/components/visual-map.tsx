import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { VisualStatus } from "@/lib/epod";
import { FitBounds } from "./leaflet-fit-bounds";

export type VisualPoint = {
  waybill: string;
  lat: number;
  lon: number;
  address: string;
  zip: string;
  taskStatus: string;
  status: VisualStatus;
  driverName: string;
};

const MADRID_CENTER: LatLngExpression = [40.4168, -3.7038];

// Literal colors (not CSS vars) — Leaflet's SVG/canvas renderer needs a resolvable color value.
const STATUS_COLORS: Record<VisualStatus, string> = {
  delivered: "#16a34a",
  failed: "#dc2626",
  received: "#2563eb",
  other: "#9ca3af",
};

const STATUS_LABELS: Record<VisualStatus, string> = {
  delivered: "Entregado",
  failed: "Fallado",
  received: "Recibido por el driver",
  other: "Otro estado",
};

/** Client-only Leaflet map — must be lazy-loaded, never imported during SSR. */
export default function VisualMap({
  points,
  className = "h-[28rem] w-full rounded-xl border border-border",
}: {
  points: VisualPoint[];
  className?: string;
}) {
  const allPoints: LatLngExpression[] = points.map((p) => [p.lat, p.lon]);

  return (
    <MapContainer center={allPoints[0] ?? MADRID_CENTER} zoom={12} scrollWheelZoom className={className}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
        maxZoom={19}
      />
      {points.map((p) => (
        <CircleMarker
          key={p.waybill}
          center={[p.lat, p.lon]}
          radius={7}
          pathOptions={{
            color: STATUS_COLORS[p.status],
            fillColor: STATUS_COLORS[p.status],
            fillOpacity: 0.85,
            weight: 1,
          }}
        >
          <Popup>
            <strong>{p.waybill}</strong>
            <br />
            Estado: {STATUS_LABELS[p.status]} ({p.taskStatus || "—"})
            <br />
            CP {p.zip || "—"}
            {p.address && (
              <>
                <br />
                {p.address}
              </>
            )}
            {p.driverName && (
              <>
                <br />
                Driver: {p.driverName}
              </>
            )}
          </Popup>
        </CircleMarker>
      ))}
      <FitBounds points={allPoints} />
    </MapContainer>
  );
}
