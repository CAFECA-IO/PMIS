/**
 * PMIS-12 GIS — 輕量空間運算工具（無外部相依）。
 * 座標一律使用 [lng, lat]（GeoJSON 慣例），距離以公尺計。
 */

export type Position = [number, number]; // [lng, lat]

const EARTH_RADIUS_M = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** 兩經緯度點之大圓距離（公尺）。 */
export function haversineMeters(a: Position, b: Position): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** 點是否落在單一環（ray-casting）。ring 為 [[lng,lat], ...]。 */
export function pointInRing(point: Position, ring: Position[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 點是否落在 Polygon（含外環與內環扣除）。coordinates: [outer, hole1, ...]。 */
export function pointInPolygon(point: Position, polygon: Position[][]): boolean {
  if (polygon.length === 0) return false;
  if (!pointInRing(point, polygon[0])) return false;
  // 內環（洞）命中則視為不在多邊形內
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(point, polygon[i])) return false;
  }
  return true;
}

export type Geometry =
  | { type: "Point"; coordinates: Position }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] }
  | { type: "MultiPoint"; coordinates: Position[] };

/** 點是否落在 Polygon 或 MultiPolygon 幾何內。 */
export function pointInGeometry(point: Position, geom: Geometry): boolean {
  if (geom.type === "Polygon") return pointInPolygon(point, geom.coordinates);
  if (geom.type === "MultiPolygon")
    return geom.coordinates.some((poly) => pointInPolygon(point, poly));
  return false;
}

/** 取幾何上所有代表點（點層取點、多邊形取頂點）供最近距離計算。 */
export function geometryVertices(geom: Geometry): Position[] {
  switch (geom.type) {
    case "Point":
      return [geom.coordinates];
    case "MultiPoint":
    case "LineString":
      return geom.coordinates;
    case "Polygon":
      return geom.coordinates.flat();
    case "MultiPolygon":
      return geom.coordinates.flat(2);
    default:
      return [];
  }
}

/** 到某幾何的最短距離（公尺，取代表點近似）。 */
export function distanceToGeometry(point: Position, geom: Geometry): number {
  const verts = geometryVertices(geom);
  let min = Infinity;
  for (const v of verts) {
    const d = haversineMeters(point, v);
    if (d < min) min = d;
  }
  return min;
}
