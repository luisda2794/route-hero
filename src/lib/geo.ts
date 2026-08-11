/** Google Maps deep link — opens turn-by-turn directions in the app if installed, or maps.google.com otherwise. Prefers coordinates (more precise than the free-text address) and only falls back to the address if they're missing/invalid. */
export function googleMapsUrl(point: { lat: number; lon: number; address: string }): string {
  const hasCoords = Number.isFinite(point.lat) && Number.isFinite(point.lon) && (point.lat !== 0 || point.lon !== 0);
  const destination = hasCoords ? `${point.lat},${point.lon}` : point.address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
