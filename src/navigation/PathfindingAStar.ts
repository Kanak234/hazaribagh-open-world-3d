/**
 * Production A* and Dijkstra Pathfinding Engine.
 * Computes optimal vehicular and pedestrian routes over the Hazaribagh RoadGraph.
 * Employs a binary min-heap priority queue and Euclidean heuristic.
 */

import { Vector3D, PathfindingResult } from '../core/Types';
import { RoadGraph } from './RoadGraph';
import { Guardrails } from '../core/Guardrails';

interface HeapNode {
  nodeId: number;
  priority: number;
}

class BinaryMinHeap {
  private data: HeapNode[] = [];

  public get length(): number {
    return this.data.length;
  }

  public push(node: HeapNode): void {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  public pop(): HeapNode | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const bottom = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    const item = this.data[index];
    while (index > 0) {
      const parentIdx = Math.floor((index - 1) / 2);
      const parent = this.data[parentIdx];
      if (item.priority >= parent.priority) break;
      this.data[index] = parent;
      index = parentIdx;
    }
    this.data[index] = item;
  }

  private sinkDown(index: number): void {
    const length = this.data.length;
    const item = this.data[index];

    while (true) {
      const leftChildIdx = 2 * index + 1;
      const rightChildIdx = 2 * index + 2;
      let swapIdx: number | null = null;
      let minPriority = item.priority;

      if (leftChildIdx < length) {
        if (this.data[leftChildIdx].priority < minPriority) {
          swapIdx = leftChildIdx;
          minPriority = this.data[leftChildIdx].priority;
        }
      }

      if (rightChildIdx < length) {
        if (this.data[rightChildIdx].priority < minPriority) {
          swapIdx = rightChildIdx;
        }
      }

      if (swapIdx === null) break;
      this.data[index] = this.data[swapIdx];
      index = swapIdx;
    }
    this.data[index] = item;
  }
}

export class PathfindingAStar {
  private graph: RoadGraph;

  constructor(graph: RoadGraph) {
    this.graph = Guardrails.assertNonNull(graph, 'RoadGraph reference for Pathfinding');
  }

  /**
   * Calculates shortest path between two 3D positions using A* algorithm.
   */
  public findRouteBetweenPoints(startPos: Vector3D, endPos: Vector3D): PathfindingResult {
    const startNode = this.graph.findNearestNode(startPos);
    const endNode = this.graph.findNearestNode(endPos);

    if (!startNode || !endNode) {
      return {
        found: false,
        nodeIds: [],
        totalDistance: 0,
        waypoints: [],
      };
    }

    return this.findPath(startNode.id, endNode.id);
  }

  /**
   * Executes A* search from startNodeId to targetNodeId.
   */
  public findPath(startNodeId: number, targetNodeId: number): PathfindingResult {
    if (startNodeId === targetNodeId) {
      const node = this.graph.getNode(startNodeId);
      return {
        found: true,
        nodeIds: [startNodeId],
        totalDistance: 0,
        waypoints: node ? [{ ...node.position }] : [],
      };
    }

    const startNode = this.graph.getNode(startNodeId);
    const targetNode = this.graph.getNode(targetNodeId);

    if (!startNode || !targetNode) {
      return { found: false, nodeIds: [], totalDistance: 0, waypoints: [] };
    }

    const openSet = new BinaryMinHeap();
    const cameFrom: Map<number, number> = new Map();
    const gScore: Map<number, number> = new Map();
    const fScore: Map<number, number> = new Map();

    gScore.set(startNodeId, 0);
    const initialH = this.heuristic(startNode.position, targetNode.position);
    fScore.set(startNodeId, initialH);
    openSet.push({ nodeId: startNodeId, priority: initialH });

    const visited: Set<number> = new Set();

    while (openSet.length > 0) {
      const current = openSet.pop()!;
      const currentId = current.nodeId;

      if (currentId === targetNodeId) {
        return this.reconstructPath(cameFrom, currentId, gScore.get(targetNodeId) || 0);
      }

      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      const currentNode = this.graph.getNode(currentId);
      if (!currentNode) continue;

      const neighborIds = this.graph.getNeighborNodeIds(currentId);
      const currentG = gScore.get(currentId) ?? Infinity;

      for (const neighborId of neighborIds) {
        if (visited.has(neighborId)) {
          continue;
        }

        const neighborNode = this.graph.getNode(neighborId);
        if (!neighborNode) continue;

        // Euclidean segment distance
        const edgeDist = Math.hypot(
          neighborNode.position.x - currentNode.position.x,
          neighborNode.position.y - currentNode.position.y,
          neighborNode.position.z - currentNode.position.z
        );

        const tentativeG = currentG + edgeDist;
        const neighborG = gScore.get(neighborId) ?? Infinity;

        if (tentativeG < neighborG) {
          cameFrom.set(neighborId, currentId);
          gScore.set(neighborId, tentativeG);
          const h = this.heuristic(neighborNode.position, targetNode.position);
          const f = tentativeG + h;
          fScore.set(neighborId, f);
          openSet.push({ nodeId: neighborId, priority: f });
        }
      }
    }

    // No path found
    return {
      found: false,
      nodeIds: [],
      totalDistance: 0,
      waypoints: [],
    };
  }

  private heuristic(a: Vector3D, b: Vector3D): number {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  private reconstructPath(cameFrom: Map<number, number>, currentId: number, totalDist: number): PathfindingResult {
    const path: number[] = [currentId];
    let curr = currentId;

    while (cameFrom.has(curr)) {
      curr = cameFrom.get(curr)!;
      path.unshift(curr);
    }

    const waypoints: Vector3D[] = [];
    for (const id of path) {
      const node = this.graph.getNode(id);
      if (node) {
        waypoints.push({ ...node.position });
      }
    }

    return {
      found: true,
      nodeIds: path,
      totalDistance: totalDist,
      waypoints,
    };
  }
}
