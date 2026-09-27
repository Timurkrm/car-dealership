/** GeoJSON uses [longitude, latitude]. Distances must be computed by PostGIS. */
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}
