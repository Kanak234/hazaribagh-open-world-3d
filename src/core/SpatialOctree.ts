/**
 * Hierarchical Spatial Partitioning: 3D Octree / BVH for Open-World Streaming.
 * Organizes world geometry, road segments, building blocks, and landmarks.
 * Provides camera frustum culling queries and radius-based streaming to lock 60+ FPS.
 */

import * as THREE from 'three';
import { AABB3D, SpatialOctreeItem, Vector3D } from './Types';
import { Guardrails } from './Guardrails';

export class OctreeNode {
  public aabb: AABB3D;
  public depth: number;
  public items: SpatialOctreeItem[] = [];
  public children: OctreeNode[] | null = null;
  public readonly maxItems: number;
  public readonly maxDepth: number;

  constructor(aabb: AABB3D, depth: number = 0, maxItems: number = 16, maxDepth: number = 7) {
    this.aabb = aabb;
    this.depth = depth;
    this.maxItems = maxItems;
    this.maxDepth = maxDepth;
  }

  public isLeaf(): boolean {
    return this.children === null;
  }

  public subdivide(): void {
    if (this.children !== null) {
      return;
    }

    const { min, max } = this.aabb;
    const midX = (min.x + max.x) * 0.5;
    const midY = (min.y + max.y) * 0.5;
    const midZ = (min.z + max.z) * 0.5;

    this.children = [
      new OctreeNode({ min: { x: min.x, y: min.y, z: min.z }, max: { x: midX, y: midY, z: midZ } }, this.depth + 1, this.maxItems, this.maxDepth),
      new OctreeNode({ min: { x: midX, y: min.y, z: min.z }, max: { x: max.x, y: midY, z: midZ } }, this.depth + 1, this.maxItems, this.maxDepth),
      new OctreeNode({ min: { x: min.x, y: midY, z: min.z }, max: { x: midX, y: max.y, z: midZ } }, this.depth + 1, this.maxItems, this.maxDepth),
      new OctreeNode({ min: { x: midX, y: midY, z: min.z }, max: { x: max.x, y: max.y, z: midZ } }, this.depth + 1, this.maxItems, this.maxDepth),
      new OctreeNode({ min: { x: min.x, y: min.y, z: midZ }, max: { x: midX, y: midY, z: max.z } }, this.depth + 1, this.maxItems, this.maxDepth),
      new OctreeNode({ min: { x: midX, y: min.y, z: midZ }, max: { x: max.x, y: midY, z: max.z } }, this.depth + 1, this.maxItems, this.maxDepth),
      new OctreeNode({ min: { x: min.x, y: midY, z: midZ }, max: { x: midX, y: max.y, z: max.z } }, this.depth + 1, this.maxItems, this.maxDepth),
      new OctreeNode({ min: { x: midX, y: midY, z: midZ }, max: { x: max.x, y: max.y, z: max.z } }, this.depth + 1, this.maxItems, this.maxDepth),
    ];

    // Re-distribute existing items to children if they fit entirely inside
    const remainingItems: SpatialOctreeItem[] = [];
    for (const item of this.items) {
      let placed = false;
      for (const child of this.children) {
        if (SpatialOctree.containsAABB(child.aabb, item.aabb)) {
          child.insert(item);
          placed = true;
          break;
        }
      }
      if (!placed) {
        remainingItems.push(item);
      }
    }
    this.items = remainingItems;
  }

  public insert(item: SpatialOctreeItem): boolean {
    if (!SpatialOctree.intersectsAABB(this.aabb, item.aabb)) {
      return false;
    }

    if (this.isLeaf()) {
      if (this.items.length < this.maxItems || this.depth >= this.maxDepth) {
        this.items.push(item);
        return true;
      }
      this.subdivide();
    }

    if (this.children !== null) {
      for (const child of this.children) {
        if (SpatialOctree.containsAABB(child.aabb, item.aabb)) {
          return child.insert(item);
        }
      }
    }

    // Spans across multiple octants or cannot fit in a single child, retain at this node
    this.items.push(item);
    return true;
  }
}

export class SpatialOctree {
  private root: OctreeNode;
  private totalItemCount: number = 0;
  private threeBoxHelper: THREE.Box3 = new THREE.Box3();

  constructor(worldBounds: AABB3D, maxItemsPerNode: number = 16, maxDepth: number = 7) {
    if (!Guardrails.isValidAABB(worldBounds)) {
      worldBounds = {
        min: { x: -5000, y: -200, z: -5000 },
        max: { x: 5000, y: 1000, z: 5000 },
      };
    }
    this.root = new OctreeNode(worldBounds, 0, maxItemsPerNode, maxDepth);
  }

  public insert(item: SpatialOctreeItem): void {
    if (!Guardrails.isValidAABB(item.aabb)) {
      return;
    }
    this.root.insert(item);
    this.totalItemCount++;
  }

  public clear(): void {
    const bounds = this.root.aabb;
    const maxItems = this.root.maxItems;
    const maxDepth = this.root.maxDepth;
    this.root = new OctreeNode(bounds, 0, maxItems, maxDepth);
    this.totalItemCount = 0;
  }

  /**
   * Fast AABB-AABB intersection test.
   */
  public static intersectsAABB(a: AABB3D, b: AABB3D): boolean {
    return (
      a.min.x <= b.max.x &&
      a.max.x >= b.min.x &&
      a.min.y <= b.max.y &&
      a.max.y >= b.min.y &&
      a.min.z <= b.max.z &&
      a.max.z >= b.min.z
    );
  }

  /**
   * Fast containment test: returns true if container entirely wraps candidate.
   */
  public static containsAABB(container: AABB3D, candidate: AABB3D): boolean {
    return (
      container.min.x <= candidate.min.x &&
      container.max.x >= candidate.max.x &&
      container.min.y <= candidate.min.y &&
      container.max.y >= candidate.max.y &&
      container.min.z <= candidate.min.z &&
      container.max.z >= candidate.max.z
    );
  }

  /**
   * Queries items inside active camera view frustum.
   */
  public queryFrustum(frustum: THREE.Frustum): SpatialOctreeItem[] {
    const results: SpatialOctreeItem[] = [];
    const stack: OctreeNode[] = [this.root];

    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) {
        continue;
      }

      this.threeBoxHelper.min.set(node.aabb.min.x, node.aabb.min.y, node.aabb.min.z);
      this.threeBoxHelper.max.set(node.aabb.max.x, node.aabb.max.y, node.aabb.max.z);

      if (!frustum.intersectsBox(this.threeBoxHelper)) {
        continue;
      }

      // Check items held at current node
      for (const item of node.items) {
        this.threeBoxHelper.min.set(item.aabb.min.x, item.aabb.min.y, item.aabb.min.z);
        this.threeBoxHelper.max.set(item.aabb.max.x, item.aabb.max.y, item.aabb.max.z);
        if (frustum.intersectsBox(this.threeBoxHelper)) {
          results.push(item);
        }
      }

      // Traverse children
      if (node.children !== null) {
        for (let i = 0; i < node.children.length; i++) {
          stack.push(node.children[i]);
        }
      }
    }

    return results;
  }

  /**
   * Radial distance query for chunk streaming around the player.
   */
  public queryRadius(center: Vector3D, radius: number): SpatialOctreeItem[] {
    const results: SpatialOctreeItem[] = [];
    const radiusSq = radius * radius;
    const stack: OctreeNode[] = [this.root];

    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) {
        continue;
      }

      // Quick distance test between point and node bounding box
      const closestX = Math.max(node.aabb.min.x, Math.min(center.x, node.aabb.max.x));
      const closestY = Math.max(node.aabb.min.y, Math.min(center.y, node.aabb.max.y));
      const closestZ = Math.max(node.aabb.min.z, Math.min(center.z, node.aabb.max.z));

      const dx = center.x - closestX;
      const dy = center.y - closestY;
      const dz = center.z - closestZ;
      if (dx * dx + dy * dy + dz * dz > radiusSq) {
        continue;
      }

      for (const item of node.items) {
        const itemMidX = (item.aabb.min.x + item.aabb.max.x) * 0.5;
        const itemMidY = (item.aabb.min.y + item.aabb.max.y) * 0.5;
        const itemMidZ = (item.aabb.min.z + item.aabb.max.z) * 0.5;
        const idx = center.x - itemMidX;
        const idy = center.y - itemMidY;
        const idz = center.z - itemMidZ;
        if (idx * idx + idy * idy + idz * idz <= radiusSq) {
          results.push(item);
        }
      }

      if (node.children !== null) {
        for (let i = 0; i < node.children.length; i++) {
          stack.push(node.children[i]);
        }
      }
    }

    return results;
  }

  public getTotalNodesCount(): number {
    let count = 0;
    const stack: OctreeNode[] = [this.root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      count++;
      if (node.children !== null) {
        for (let i = 0; i < node.children.length; i++) {
          stack.push(node.children[i]);
        }
      }
    }
    return count;
  }

  public getTotalItemsCount(): number {
    return this.totalItemCount;
  }
}
