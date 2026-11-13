import type { MapFeature } from "@/lib/types";

export function formatCoordinates(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

/** Area-weighted center of a ring given as [latitude, longitude] pairs. */
export function polygonCenter(points: [number, number][]): [number, number] | null {
  const closing = points.at(-1);
  const ring = points.length > 1 && closing && points[0][0] === closing[0] && points[0][1] === closing[1]
    ? points.slice(0, -1)
    : points.slice();
  if (ring.length === 0) return null;
  if (ring.length < 3) {
    const latitude = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
    const longitude = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
    return [latitude, longitude];
  }
  let signed = 0;
  let latitude = 0;
  let longitude = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [lat1, lng1] = ring[index];
    const [lat2, lng2] = ring[(index + 1) % ring.length];
    const cross = lng1 * lat2 - lng2 * lat1;
    signed += cross;
    longitude += (lng1 + lng2) * cross;
    latitude += (lat1 + lat2) * cross;
  }
  if (Math.abs(signed) < 1e-12) {
    const meanLat = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
    const meanLng = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
    return [meanLat, meanLng];
  }
  return [latitude / (3 * signed), longitude / (3 * signed)];
}

export function featureCenter(feature: MapFeature): [number, number] | null {
  if (feature.geometry.type === "Point") {
    const [longitude, latitude] = feature.geometry.coordinates;
    return [latitude, longitude];
  }
  const ring = feature.geometry.coordinates[0]?.map(([longitude, latitude]) => [latitude, longitude] as [number, number]) ?? [];
  return polygonCenter(ring);
}
