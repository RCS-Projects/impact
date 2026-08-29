const EARTH_RADIUS_METERS = 6371008.8;

export function circlePolygon(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  segments = 48,
): [number, number][] {
  const lat1 = (latitude * Math.PI) / 180;
  const lng1 = (longitude * Math.PI) / 180;
  const angular = radiusMeters / EARTH_RADIUS_METERS;
  const ring: [number, number][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const bearing = (i / segments) * Math.PI * 2;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([(((lng2 * 180) / Math.PI + 540) % 360) - 180, (lat2 * 180) / Math.PI]);
  }
  return ring;
}

export function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

type Ring = [number, number][];

export function geoJsonAreaCenter(geojson: unknown, fallback: [number, number]): [number, number] {
  if (!geojson || typeof geojson !== 'object') return fallback;
  const geometry = geojson as { type?: string; coordinates?: unknown };
  const rings: Ring[] = [];
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    const outer = geometry.coordinates[0];
    if (Array.isArray(outer)) rings.push(outer as Ring);
  } else if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    for (const polygon of geometry.coordinates) {
      if (Array.isArray(polygon) && Array.isArray(polygon[0])) rings.push(polygon[0] as Ring);
    }
  }
  const points = rings.flatMap((ring) => ring.slice(0, -1));
  if (!points.length) return fallback;
  const [longitude, latitude] = points.reduce(
    ([lng, lat], [pointLng, pointLat]) => [lng + pointLng, lat + pointLat],
    [0, 0],
  );
  return [longitude / points.length, latitude / points.length];
}

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i] ?? [0, 0];
    const [xj, yj] = ring[j] ?? [0, 0];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInGeoJsonArea(longitude: number, latitude: number, geojson: unknown): boolean {
  if (!geojson || typeof geojson !== 'object') return true;
  const geometry = geojson as { type?: string; coordinates?: unknown };
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    const [outer, ...holes] = geometry.coordinates as Ring[];
    if (!outer || !pointInRing(longitude, latitude, outer)) return false;
    return !holes.some((hole) => pointInRing(longitude, latitude, hole));
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return (geometry.coordinates as Ring[][]).some((polygon) => {
      const [outer, ...holes] = polygon;
      if (!outer || !pointInRing(longitude, latitude, outer)) return false;
      return !holes.some((hole) => pointInRing(longitude, latitude, hole));
    });
  }
  return true;
}
