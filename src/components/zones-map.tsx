import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Zone } from "@/lib/clustering";

const FALLBACK_COLOR = "#3388ff";

const MADRID_CENTER: LatLngExpression = [40.4168, -3.7038];

function FitBounds({ points }: { points: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(points, { padding: [24, 24] });
  }, [map, points]);
  return null;
}

/** Client-only Leaflet map — must be lazy-loaded, never imported during SSR. */
export default function ZonesMap({ zones, colors }: { zones: Zone[]; colors: Record<string, string> }) {
  const allPoints: LatLngExpression[] = zones.flatMap((zone) =>
    zone.points.map((p): LatLngExpression => [p.lat, p.lon]),
  );

  return (
    <MapContainer
      center={allPoints[0] ?? MADRID_CENTER}
      zoom={12}
      scrollWheelZoom
      className="h-80 w-full rounded-2xl border-2 border-border"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {zones.map((zone) => {
        const color = colors[zone.id] ?? FALLBACK_COLOR;
        return zone.points.map((p) => (
          <CircleMarker
            key={p.waybill}
            center={[p.lat, p.lon]}
            radius={7}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 1 }}
          >
            <Popup>
              <strong>{zone.name}</strong>
              <br />
              {p.waybill}
              {p.address && (
                <>
                  <br />
                  {p.address}
                </>
              )}
            </Popup>
          </CircleMarker>
        ));
      })}
      <FitBounds points={allPoints} />
    </MapContainer>
  );
}
