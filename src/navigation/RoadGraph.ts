/**
 * Weighted Road Graph Topology for Hazaribagh Road Network.
 * Builds an interconnected graph of road intersections and directional segments.
 * Provides adjacency lookups, distance weights, and spatial snapping for AI navigation.
 */

import { Vector3D, RoadNode, RoadEdge } from '../core/Types';
import { ParsedRoadSegment } from '../gis/RealOsmLoader';
import { Guardrails } from '../core/Guardrails';

export class RoadGraph {
  private nodes: Map<number, RoadNode> = new Map();
  private edges: Map<string, RoadEdge> = new Map();
  private adjacency: Map<number, Set<number>> = new Map();
  private nextGeneratedNodeId: number = 10000000;

  /**
   * Clears the graph state.
   */
  public clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.adjacency.clear();
  }

  /**
   * Ingests parsed OSM road corridors and constructs a connected topological graph.
   * Performs spatial snapping at intersections to ensure clean traversability.
   */
  public buildFromOsm(roadSegments: ParsedRoadSegment[], snapThresholdMeters: number = 3.5): void {
    this.clear();
    const spatialIndex: { id: number; pos: Vector3D }[] = [];

    const getOrCreateSnappedNode = (point: Vector3D): number => {
      // Find existing nearby node to snap intersections together
      for (const entry of spatialIndex) {
        const dx = entry.pos.x - point.x;
        const dz = entry.pos.z - point.z;
        if (Math.hypot(dx, dz) <= snapThresholdMeters) {
          return entry.id;
        }
      }

      const newNodeId = this.nextGeneratedNodeId++;
      const node: RoadNode = {
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
        const forwardEdge: RoadEdge = {
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
        const reverseEdge: RoadEdge = {
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

    console.log(
      `[RoadGraph] Ingestion complete: ${this.nodes.size} intersection nodes and ${this.edges.size} road edges generated.`
    );
  }

  public getNode(nodeId: number): RoadNode | undefined {
    return this.nodes.get(nodeId);
  }

  public getEdge(edgeId: string): RoadEdge | undefined {
    return this.edges.get(edgeId);
  }

  public getAllNodes(): RoadNode[] {
    return Array.from(this.nodes.values());
  }

  public getAllEdges(): RoadEdge[] {
    return Array.from(this.edges.values());
  }

  public getNeighborNodeIds(nodeId: number): number[] {
    const neighbors = this.adjacency.get(nodeId);
    return neighbors ? Array.from(neighbors) : [];
  }

  /**
   * Finds the nearest road intersection node to any given 3D world position.
   */
  public findNearestNode(position: Vector3D, maxDistance: number = 2000): RoadNode | null {
    if (!Guardrails.isValidVector3(position)) {
      return null;
    }

    let nearest: RoadNode | null = null;
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
