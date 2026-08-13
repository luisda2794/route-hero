import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Zone } from "@/lib/clustering";
import { FitBounds } from "./leaflet-fit-bounds";

const FALLBACK_COLOR = "#3388ff";

const MADRID_CENTER: LatLngExpression = [40.4168, -3.7038];

/** Client-only Leaflet map — must be lazy-loaded, never imported during SSR. */
export default function ZonesMap({
  zones,
  colors,
  className = "h-80 w-full rounded-xl border border-border",
}: {
  zones: Zone[];
  colors: Record<string, string>;
  /** Overrides the default size/shape — the Dashboard and Paso 3 pass a much taller class. */
  className?: string;
}) {
  const allPoints: LatLngExpression[] = zones.flatMap((zone) =>
    zone.points.map((p): LatLngExpression => [p.lat, p.lon]),
  );

  return (
    <MapContainer center={allPoints[0] ?? MADRID_CENTER} zoom={12} scrollWheelZoom className={className}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
        maxZoom={19}
      />
      {zones.map((zone) => {
        const color = colors[zone.id] ?? FALLBACK_COLOR;
        // Andarín zones get a dashed outline so they read as "on foot" at a glance.
        const pathOptions = {
          color,
          fillColor: color,
          fillOpacity: 0.85,
          weight: zone.driverType === "andarin" ? 2 : 1,
          ...(zone.driverType === "andarin" ? { dashArray: "4 3" } : {}),
        };
        return zone.points.map((p) => (
          <CircleMarker key={p.waybill} center={[p.lat, p.lon]} radius={7} pathOptions={pathOptions}>
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
