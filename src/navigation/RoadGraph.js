/**
 * Weighted Road Graph Topology for Hazaribagh Road Network.
 * Builds an interconnected graph of road intersections and directional segments.
 * Provides adjacency lookups, distance weights, and spatial snapping for AI navigation.
 */
import { Guardrails } from '../core/Guardrails';
export class RoadGraph {
    nodes = new Map();
    edges = new Map();
    adjacency = new Map();
    nextGeneratedNodeId = 10000000;
    /**
     * Clears the graph state.
     */
    clear() {
        this.nodes.clear();
        this.edges.clear();
        this.adjacency.clear();
    }
    /**
     * Ingests parsed OSM road corridors and constructs a connected topological graph.
     * Performs spatial snapping at intersections to ensure clean traversability.
     */
    buildFromOsm(roadSegments, snapThresholdMeters = 3.5) {
        this.clear();
        const spatialIndex = [];
        const getOrCreateSnappedNode = (point) => {
            // Find existing nearby node to snap intersections together
            for (const entry of spatialIndex) {
                const dx = entry.pos.x - point.x;
                const dz = entry.pos.z - point.z;
                if (Math.hypot(dx, dz) <= snapThresholdMeters) {
                    return entry.id;
                }
            }
            const newNodeId = this.nextGeneratedNodeId++;
            const node = {
                id: newNodeId,
                position: { x: point.x, y: point.y, z: point.z },
                edges: [],
            };
            this.nodes.set(newNodeId, node);
            this.adjacency.set(newNodeId, new Set());
            spatialIndex.push({ id: newNodeId, pos: node.position });
            return newNodeId;
        };
        for (let sIdx = 0; sIdx < roadSegments.length; sIdx++) {
            const seg = roadSegments[sIdx];
            if (!seg.points || seg.points.length < 2) {
                continue;
            }
            // Connect consecutive points along the road way
            for (let i = 0; i < seg.points.length - 1; i++) {
                const p1 = seg.points[i];
                const p2 = seg.points[i + 1];
                const uId = getOrCreateSnappedNode(p1);
                const vId = getOrCreateSnappedNode(p2);
                if (uId === vId) {
                    continue;
                }
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const dz = p2.z - p1.z;
                const length = Math.hypot(dx, dy, dz);
                // Forward Edge
                const edgeForwardId = `edge_${uId}_${vId}_${sIdx}`;
                const forwardEdge = {
                    id: edgeForwardId,
                    fromNodeId: uId,
                    toNodeId: vId,
                    length,
                    lanes: seg.lanes,
                    speedLimitKmh: seg.speedLimitKmh,
                    highwayType: seg.highwayType,
                    name: seg.name,
                    geometry: [p1, p2],
                };
                this.edges.set(edgeForwardId, forwardEdge);
                this.nodes.get(uId)?.edges.push(edgeForwardId);
                this.adjacency.get(uId)?.add(vId);
                // Reverse Edge (two-way street topology)
                const edgeReverseId = `edge_${vId}_${uId}_${sIdx}`;
                const reverseEdge = {
                    id: edgeReverseId,
                    fromNodeId: vId,
                    toNodeId: uId,
                    length,
                    lanes: seg.lanes,
                    speedLimitKmh: seg.speedLimitKmh,
                    highwayType: seg.highwayType,
                    name: seg.name,
                    geometry: [p2, p1],
                };
                this.edges.set(edgeReverseId, reverseEdge);
                this.nodes.get(vId)?.edges.push(edgeReverseId);
                this.adjacency.get(vId)?.add(uId);
            }
        }
        console.log(`[RoadGraph] Ingestion complete: ${this.nodes.size} intersection nodes and ${this.edges.size} road edges generated.`);
    }
    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }
    getEdge(edgeId) {
        return this.edges.get(edgeId);
    }
    getAllNodes() {
        return Array.from(this.nodes.values());
    }
    getAllEdges() {
        return Array.from(this.edges.values());
    }
    getNeighborNodeIds(nodeId) {
        const neighbors = this.adjacency.get(nodeId);
        return neighbors ? Array.from(neighbors) : [];
    }
    /**
     * Finds the nearest road intersection node to any given 3D world position.
     */
    findNearestNode(position, maxDistance = 2000) {
        if (!Guardrails.isValidVector3(position)) {
            return null;
        }
        let nearest = null;
        let minDistSq = maxDistance * maxDistance;
        for (const node of this.nodes.values()) {
            const dx = node.position.x - position.x;
            const dz = node.position.z - position.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearest = node;
            }
        }
        return nearest;
    }
}
