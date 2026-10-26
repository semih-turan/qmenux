export const GEOFENCE_MODES = ['OFF', 'RADIUS', 'ADMIN_REGIONS', 'COMBINED'] as const;
export type GeofenceMode = (typeof GEOFENCE_MODES)[number];

export const MIN_RADIUS_KM = 0.05;
export const MAX_RADIUS_KM = 50;

const R_KM = 6371.0088;

export type LatLng = { lat: number; lng: number };

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/**
 * Radius check including reported GPS accuracy tolerance (capped at 500 m).
 * Browser coordinates are spoofable: this is a convenience gate, not a security barrier.
 */
export function withinRadius(center: LatLng, radiusKm: number, point: LatLng & { accuracyM?: number }): boolean {
  const tolKm = Math.min(Math.max(point.accuracyM ?? 0, 0), 500) / 1000;
  return haversineKm(center, point) <= radiusKm + tolKm;
}
