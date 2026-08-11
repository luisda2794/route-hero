import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L, { type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Zone } from "@/lib/clustering";
import type { StopStatus } from "@/lib/driver";

const MADRID_CENTER: LatLngExpression = [40.4168, -3.7038];

const STATUS_COLORS: Record<StopStatus, string> = {
  delivered: "#16a34a",
  failed: "#dc2626",
  pending: "#2563eb",
};

const STATUS_LABELS: Record<StopStatus, string> = {
  delivered: "Entregado",
  failed: "Fallado",
  pending: "Pendiente",
};

function numberedIcon(stopNumber: number, status: StopStatus, highlighted: boolean): L.DivIcon {
  const size = highlighted ? 34 : 28;
  const ring = highlighted ? "0 0 0 4px rgba(37,99,235,0.35)" : "0 1px 3px rgba(0,0,0,0.4)";
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${STATUS_COLORS[status]};border:2px solid white;box-shadow:${ring};display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:${highlighted ? 14 : 12}px;">${stopNumber}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitBounds({ points }: { points: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
  }, [map, points]);
  return null;
}

/**
 * Client-only Leaflet map for a single driver's zone — numbered stops in
 * route order, connected by a line in the driver's own color (same palette
 * as the Dashboard's fleet map), each stop tinted by delivery status.
 */
export default function DriverZoneMap({
  zone,
  color,
  statusByWaybill,
  highlightedWaybill,
  className = "h-80 w-full rounded-xl border border-border",
}: {
  zone: Zone;
  color: string;
  statusByWaybill: Record<string, StopStatus>;
  highlightedWaybill?: string | null;
  className?: string;
}) {
  const points = zone.points.slice().sort((a, b) => a.stopNumber - b.stopNumber);
  const allPoints: LatLngExpression[] = points.map((p) => [p.lat, p.lon]);

  return (
    <MapContainer center={allPoints[0] ?? MADRID_CENTER} zoom={13} scrollWheelZoom className={className}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
        maxZoom={19}
      />
      <Polyline
        positions={allPoints}
        pathOptions={{
          color,
          weight: 3,
          opacity: 0.7,
          ...(zone.driverType === "andarin" ? { dashArray: "6 5" } : {}),
        }}
      />
      {points.map((p) => {
        const status = statusByWaybill[p.waybill] ?? "pending";
        const highlighted = p.waybill === highlightedWaybill;
        return (
          <Marker
            key={p.waybill}
            position={[p.lat, p.lon]}
            icon={numberedIcon(p.stopNumber, status, highlighted)}
          >
            <Popup>
              <strong>Parada {p.stopNumber}</strong> · {STATUS_LABELS[status]}
              <br />
              {p.waybill}
              {p.address && (
                <>
                  <br />
                  {p.address}
                </>
              )}
              {p.zip && (
                <>
                  <br />
                  CP {p.zip}
                </>
              )}
            </Popup>
          </Marker>
        );
      })}
      <FitBounds points={allPoints} />
    </MapContainer>
  );
}
