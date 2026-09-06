/**
 * Continuous Collision Detection: Swept AABB Algorithm.
 * Prevents character and vehicle tunneling through geometry at high velocities.
 * Computes exact Time of Impact (TOI in [0, 1]) and collision contact normal.
 */

import { AABB3D, SweptHit, Vector3D } from '../core/Types';
import { Guardrails } from '../core/Guardrails';

export class SweptAABB {
  /**
   * Sweeps moving box 'a' with displacement vector 'velocity' against static box 'b'.
   */
  public static sweep(
    boxA: AABB3D,
    velocity: Vector3D,
    boxB: AABB3D,
    colliderId: string | null = null
  ): SweptHit {
    const noHit: SweptHit = {
      hit: false,
      time: 1.0,
      normal: { x: 0, y: 0, z: 0 },
      point: { x: 0, y: 0, z: 0 },
      colliderId: null,
    };

    if (!Guardrails.isValidAABB(boxA) || !Guardrails.isValidAABB(boxB) || !Guardrails.isValidVector3(velocity)) {
      return noHit;
    }

    // Check if velocities are negligible
    if (Math.abs(velocity.x) < 1e-7 && Math.abs(velocity.y) < 1e-7 && Math.abs(velocity.z) < 1e-7) {
      return noHit;
    }

    // Find entry and exit distances for each axis
    let xInvEntry: number;
    let xInvExit: number;
    if (velocity.x > 0) {
      xInvEntry = boxB.min.x - boxA.max.x;
      xInvExit = boxB.max.x - boxA.min.x;
    } else {
      xInvEntry = boxB.max.x - boxA.min.x;
      xInvExit = boxB.min.x - boxA.max.x;
    }

    let yInvEntry: number;
    let yInvExit: number;
    if (velocity.y > 0) {
      yInvEntry = boxB.min.y - boxA.max.y;
      yInvExit = boxB.max.y - boxA.min.y;
    } else {
      yInvEntry = boxB.max.y - boxA.min.y;
      yInvExit = boxB.min.y - boxA.max.y;
    }

    let zInvEntry: number;
    let zInvExit: number;
    if (velocity.z > 0) {
      zInvEntry = boxB.min.z - boxA.max.z;
      zInvExit = boxB.max.z - boxA.min.z;
    } else {
      zInvEntry = boxB.max.z - boxA.min.z;
      zInvExit = boxB.min.z - boxA.max.z;
    }

    // Time of impact along each axis
    let xEntry: number;
    let xExit: number;
    if (velocity.x === 0) {
      xEntry = -Infinity;
      xExit = Infinity;
    } else {
      xEntry = xInvEntry / velocity.x;
      xExit = xInvExit / velocity.x;
    }

    let yEntry: number;
    let yExit: number;
    if (velocity.y === 0) {
      yEntry = -Infinity;
      yExit = Infinity;
    } else {
      yEntry = yInvEntry / velocity.y;
      yExit = yInvExit / velocity.y;
    }

    let zEntry: number;
    let zExit: number;
    if (velocity.z === 0) {
      zEntry = -Infinity;
      zExit = Infinity;
    } else {
      zEntry = zInvEntry / velocity.z;
      zExit = zInvExit / velocity.z;
    }

    // Find the latest entry time and earliest exit time
    const entryTime = Math.max(xEntry, yEntry, zEntry);
    const exitTime = Math.min(xExit, yExit, zExit);

    // No collision occurs if entry is later than exit, or entry is beyond displacement, or entry is in the past
    if (entryTime > exitTime || (xEntry < 0 && yEntry < 0 && zEntry < 0) || xEntry > 1.0 || yEntry > 1.0 || zEntry > 1.0) {
      return noHit;
    }

    if (entryTime < 0.0) {
      return noHit;
    }

    // Determine normal of contact surface
    const normal: Vector3D = { x: 0, y: 0, z: 0 };
    if (entryTime === xEntry) {
      normal.x = velocity.x > 0 ? -1 : 1;
    } else if (entryTime === yEntry) {
      normal.y = velocity.y > 0 ? -1 : 1;
    } else {
      normal.z = velocity.z > 0 ? -1 : 1;
    }

    // Compute contact point
    const hitPoint: Vector3D = {
      x: (boxA.min.x + boxA.max.x) * 0.5 + velocity.x * entryTime,
      y: (boxA.min.y + boxA.max.y) * 0.5 + velocity.y * entryTime,
      z: (boxA.min.z + boxA.max.z) * 0.5 + velocity.z * entryTime,
    };

    return {
      hit: true,
      time: entryTime,
      normal,
      point: hitPoint,
      colliderId,
    };
  }
}
