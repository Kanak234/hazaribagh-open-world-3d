/**
 * Real-World Geographic Coordinate Projection for Hazaribagh, Jharkhand.
 * Translates WGS84 GPS Latitude & Longitude into metric Cartesian coordinates (X: East, Y: Elevation, Z: South).
 * Uses Mahatma Gandhi Maidan / Town Hall (23.9924352° N, 85.3616252° E) as World Origin (0, 0, 0).
 */

import { Vector3D } from '../core/Types';
import { Guardrails } from '../core/Guardrails';

export class CoordinateProjection {
  // Real-world reference origin: Gandhi Maidan, Hazaribagh, Jharkhand
  public static readonly ORIGIN_LAT = 23.9924352;
  public static readonly ORIGIN_LON = 85.3616252;
  public static readonly ORIGIN_ELEVATION = 610.0; // Mean sea level (MSL) elevation in meters

  // Canary Hill real GPS coordinates (Observation Tower)
  public static readonly CANARY_HILL_LAT = 24.015021;
  public static readonly CANARY_HILL_LON = 85.385132;
  public static readonly CANARY_HILL_PEAK_ELEVATION = 675.0; // ~65m above urban plateau

  // Hazaribagh Jheel (Lake) Center GPS
  public static readonly LAKE_LAT = 23.996210;
  public static readonly LAKE_LON = 85.360140;

  // WGS-84 Equatorial Earth radius in meters
  private static readonly WGS84_A = 6378137.0;

  // Precomputed meters per degree at Hazaribagh latitude (~23.9924°)
  private static readonly DEG_TO_RAD = Math.PI / 180.0;
  public static readonly RAD_TO_DEG = 180.0 / Math.PI;
  private static readonly METERS_PER_LAT = 110780.0; // meters per degree latitude at 24°N
  private static readonly METERS_PER_LON =
    CoordinateProjection.WGS84_A * Math.cos(CoordinateProjection.ORIGIN_LAT * CoordinateProjection.DEG_TO_RAD) * CoordinateProjection.DEG_TO_RAD;

  /**
   * Projects GPS Latitude and Longitude to 3D Cartesian coordinates relative to Hazaribagh origin.
   * X = East (+X) / West (-X)
   * Z = South (+Z) / North (-Z)
   * Y = Elevation relative to Gandhi Maidan ground level
   */
  public static gpsToWorld(lat: number, lon: number, explicitElevation?: number): Vector3D {
    const sanitizedLat = Guardrails.sanitizeNumber(lat, -90, 90, CoordinateProjection.ORIGIN_LAT);
    const sanitizedLon = Guardrails.sanitizeNumber(lon, -180, 180, CoordinateProjection.ORIGIN_LON);

    const dLon = sanitizedLon - CoordinateProjection.ORIGIN_LON;
    const dLat = sanitizedLat - CoordinateProjection.ORIGIN_LAT;

    const x = dLon * CoordinateProjection.METERS_PER_LON;
    const z = -dLat * CoordinateProjection.METERS_PER_LAT; // In Three.js: -Z is North, +Z is South

    let y = 0.0;
    if (explicitElevation !== undefined && Guardrails.isValidNumber(explicitElevation)) {
      y = explicitElevation - CoordinateProjection.ORIGIN_ELEVATION;
    } else {
      y = CoordinateProjection.calculateTopographicElevation(x, z);
    }

    return { x, y, z };
  }

  /**
   * Un-projects 3D world coordinates back into GPS Latitude and Longitude.
   */
  public static worldToGps(pos: Vector3D): { lat: number; lon: number; elevation: number } {
    const x = Guardrails.isValidNumber(pos.x) ? pos.x : 0;
    const z = Guardrails.isValidNumber(pos.z) ? pos.z : 0;
    const y = Guardrails.isValidNumber(pos.y) ? pos.y : 0;

    const dLon = x / CoordinateProjection.METERS_PER_LON;
    const dLat = -z / CoordinateProjection.METERS_PER_LAT;

    const lat = CoordinateProjection.ORIGIN_LAT + dLat;
    const lon = CoordinateProjection.ORIGIN_LON + dLon;
    const elevation = CoordinateProjection.ORIGIN_ELEVATION + y;

    return { lat, lon, elevation };
  }

  /**
   * Calculates realistic topographical elevation reflecting Hazaribagh's real terrain:
   * 1. Canary Hill prominence rising in the North-East (+65m peak with conical slope).
   * 2. Hazaribagh Jheel depression (-3m to -4m lake basin).
   * 3. Gentle rolling Chota Nagpur plateau slopes.
   */
  public static calculateTopographicElevation(worldX: number, worldZ: number): number {
    // Canary Hill peak coordinates in local space
    const canaryWorld = CoordinateProjection.gpsToWorld(
      CoordinateProjection.CANARY_HILL_LAT,
      CoordinateProjection.CANARY_HILL_LON,
      CoordinateProjection.CANARY_HILL_PEAK_ELEVATION
    );
    const canaryDist = Math.hypot(worldX - canaryWorld.x, worldZ - canaryWorld.z);

    // Canary Hill conical hill profile with falloff radius ~600m
    let canaryElevation = 0.0;
    if (canaryDist < 650.0) {
      const t = canaryDist / 650.0;
      canaryElevation = 65.0 * Math.cos((t * Math.PI) / 2.0) ** 1.6;
    }

    // Hazaribagh Jheel depression
    const lakeWorld = CoordinateProjection.gpsToWorld(
      CoordinateProjection.LAKE_LAT,
      CoordinateProjection.LAKE_LON,
      CoordinateProjection.ORIGIN_ELEVATION
    );
    const lakeDist = Math.hypot(worldX - lakeWorld.x, worldZ - lakeWorld.z);
    let lakeDepression = 0.0;
    if (lakeDist < 350.0) {
      const lt = lakeDist / 350.0;
      lakeDepression = -3.5 * (1.0 - lt);
    }

    // Chota Nagpur plateau undulation
    const plateauRoll = Math.sin(worldX * 0.002) * Math.cos(worldZ * 0.002) * 2.5;

    return canaryElevation + lakeDepression + plateauRoll;
  }
}
