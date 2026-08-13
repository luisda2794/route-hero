import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L, { type LatLngExpression } from "leaflet";

function pointKey(p: LatLngExpression): string {
  return Array.isArray(p) ? `${p[0]},${p[1]}` : `${p.lat},${p.lng}`;
}

/**
 * Fits the map to `points` — but only when the point set actually changes,
 * not on every incidental re-render. Callers rebuild `points` as a fresh
 * array on every render (unmemoized), and other state on the page — a
 * background sync poll, an unrelated field updating — can trigger those
 * re-renders too. Without this guard, the effect below fires on every one
 * of them and snaps the view back to "fit all", fighting a user mid-zoom.
 */
export function FitBounds({ points }: { points: LatLngExpression[] }) {
  const map = useMap();
  const lastSignature = useRef<string | null>(null);

  useEffect(() => {
    if (!points.length) return;
    const signature = points.map(pointKey).join("|");
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
  }, [map, points]);

  return null;
}
