/**
 * Real-World OpenStreetMap GIS Data Ingestor & Parser for Hazaribagh.
 * Ingests live Overpass API responses or local cached OSM datasets,
 * parsing real road geometries, water boundaries, and cultural landmarks.
 */
import { CoordinateProjection } from './CoordinateProjection';
import { Guardrails } from '../core/Guardrails';
export class RealOsmLoader {
    nodeMap = new Map();
    /**
     * Loads real OSM data from the cached static asset or queries the live Overpass API endpoint.
     */
    async loadData(cacheUrl = '/data/hazaribagh_osm.json') {
        let dataset = null;
        try {
            const response = await fetch(cacheUrl);
            if (response.ok) {
                dataset = (await response.json());
            }
            else {
                console.warn(`[RealOsmLoader] Cached data at ${cacheUrl} returned status ${response.status}. Trying live Overpass query...`);
            }
        }
        catch (err) {
            console.warn(`[RealOsmLoader] Failed to fetch cached OSM data:`, err);
        }
        if (!dataset || !dataset.elements || dataset.elements.length === 0) {
            dataset = await this.queryLiveOverpass();
        }
        return this.parseDataset(Guardrails.assertNonNull(dataset, 'OSM Dataset for Hazaribagh'));
    }
    /**
     * Direct live Overpass API query as fallback.
     */
    async queryLiveOverpass() {
        const query = `[out:json][timeout:30];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary|residential"](23.975,85.340,24.025,85.395);
  way["natural"="water"](23.975,85.340,24.025,85.395);
  way["water"~"lake|pond|reservoir"](23.975,85.340,24.025,85.395);
  node["place"~"town|suburb|neighbourhood"](23.975,85.340,24.025,85.395);
  node["amenity"](23.975,85.340,24.025,85.395);
  node["name"](23.975,85.340,24.025,85.395);
);
out body;
>;
out skel qt;`;
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            },
        });
        if (!response.ok) {
            throw new Error(`Overpass live query failed with HTTP status ${response.status}`);
        }
        return (await response.json());
    }
    /**
     * Parses raw OSM elements into structured 3D spatial representations.
     */
    parseDataset(dataset) {
        this.nodeMap.clear();
        let rawNodeCount = 0;
        let rawWayCount = 0;
        // Index all nodes for rapid spatial lookup
        for (const elem of dataset.elements) {
            if (elem.type === 'node') {
                rawNodeCount++;
                this.nodeMap.set(elem.id, {
                    lat: elem.lat,
                    lon: elem.lon,
                    tags: elem.tags,
                });
            }
        }
        const roads = [];
        const waterBodies = [];
        const landmarks = [];
        // Extract named landmarks from nodes
        for (const [id, node] of this.nodeMap.entries()) {
            if (node.tags && node.tags.name) {
                const name = node.tags.name;
                const category = node.tags.amenity || node.tags.tourism || node.tags.place || node.tags.leisure || 'landmark';
                const worldPos = CoordinateProjection.gpsToWorld(node.lat, node.lon);
                landmarks.push({
                    id: `osm_node_${id}`,
                    name,
                    category,
                    worldPosition: worldPos,
                    originalLat: node.lat,
                    originalLon: node.lon,
                    elevation: CoordinateProjection.ORIGIN_ELEVATION + worldPos.y,
                });
            }
        }
        // Explicitly ensure the core Hazaribagh cultural landmarks are indexed
        this.ensureCoreLandmarks(landmarks);
        // Process all ways (highways and water bodies)
        for (const elem of dataset.elements) {
            if (elem.type !== 'way') {
                continue;
            }
            rawWayCount++;
            const way = elem;
            const tags = way.tags || {};
            // 1. Road Networks
            if (tags.highway) {
                const points = [];
                for (const nodeId of way.nodes) {
                    const n = this.nodeMap.get(nodeId);
                    if (n) {
                        points.push(CoordinateProjection.gpsToWorld(n.lat, n.lon));
                    }
                }
                if (points.length >= 2) {
                    const hwType = tags.highway;
                    let lanes = 2;
                    let speedLimit = 40;
                    if (hwType === 'trunk' || hwType === 'motorway') {
                        lanes = 4;
                        speedLimit = 80; // NH 33
                    }
                    else if (hwType === 'primary') {
                        lanes = 4;
                        speedLimit = 60;
                    }
                    else if (hwType === 'secondary') {
                        lanes = 2;
                        speedLimit = 50;
                    }
                    else if (hwType === 'residential' || hwType === 'service') {
                        lanes = 2;
                        speedLimit = 30;
                    }
                    roads.push({
                        id: `road_${way.id}`,
                        wayId: way.id,
                        name: tags.name || `Hazaribagh Street (${hwType})`,
                        highwayType: hwType,
                        lanes,
                        speedLimitKmh: speedLimit,
                        points,
                    });
                }
            }
            // 2. Water Bodies (Hazaribagh Jheel, Ponds, Streams)
            if (tags.natural === 'water' || tags.water || tags.waterway) {
                const points = [];
                for (const nodeId of way.nodes) {
                    const n = this.nodeMap.get(nodeId);
                    if (n) {
                        points.push(CoordinateProjection.gpsToWorld(n.lat, n.lon));
                    }
                }
                if (points.length >= 3) {
                    const isClosed = way.nodes[0] === way.nodes[way.nodes.length - 1];
                    waterBodies.push({
                        id: `water_${way.id}`,
                        name: tags.name || 'Hazaribagh Water Basin',
                        isClosedPolygon: isClosed,
                        points,
                    });
                }
            }
        }
        console.log(`[RealOsmLoader] Parsed ${roads.length} road corridors, ${waterBodies.length} water bodies, and ${landmarks.length} cultural landmarks.`);
        return {
            roads,
            waterBodies,
            landmarks,
            rawNodeCount,
            rawWayCount,
        };
    }
    /**
     * Ensures key cultural landmarks of Hazaribagh are registered with real GPS coordinates.
     */
    ensureCoreLandmarks(landmarks) {
        const keyLandmarks = [
            {
                id: 'landmark_canary_hill',
                name: 'Canary Hill (Observation Tower)',
                category: 'hill_station',
                lat: CoordinateProjection.CANARY_HILL_LAT,
                lon: CoordinateProjection.CANARY_HILL_LON,
                elev: CoordinateProjection.CANARY_HILL_PEAK_ELEVATION,
            },
            {
                id: 'landmark_gandhi_maidan',
                name: 'Mahatma Gandhi Maidan',
                category: 'public_park',
                lat: CoordinateProjection.ORIGIN_LAT,
                lon: CoordinateProjection.ORIGIN_LON,
                elev: CoordinateProjection.ORIGIN_ELEVATION,
            },
            {
                id: 'landmark_hazaribagh_lake',
                name: 'Hazaribagh Jheel (Lake Waterfront)',
                category: 'water_reservoir',
                lat: CoordinateProjection.LAKE_LAT,
                lon: CoordinateProjection.LAKE_LON,
                elev: CoordinateProjection.ORIGIN_ELEVATION - 3.0,
            },
            {
                id: 'landmark_nh33_junction',
                name: 'NH 33 Highway Corridor (Barhi - Ramgarh)',
                category: 'national_highway',
                lat: 24.0050,
                lon: 85.3670,
                elev: CoordinateProjection.ORIGIN_ELEVATION + 2.0,
            }
        ];
        for (const key of keyLandmarks) {
            if (!landmarks.some((l) => l.name.toLowerCase().includes(key.name.toLowerCase().substring(0, 10)))) {
                const worldPos = CoordinateProjection.gpsToWorld(key.lat, key.lon, key.elev);
                landmarks.push({
                    id: key.id,
                    name: key.name,
                    category: key.category,
                    worldPosition: worldPos,
                    originalLat: key.lat,
                    originalLon: key.lon,
                    elevation: key.elev,
                });
            }
        }
    }
}
