/**
 * Defensive Programming & Validation Guardrails.
 * Provides defensive runtime assertions, finite number checks, transformation sanitization,
 * and memory safety wrappers to eliminate NaN propagation, memory leaks, and loop crashes.
 */

import { Vector3D, Transform3D, AABB3D } from './Types';

export class Guardrails {
  /**
   * Asserts whether a given number is finite and non-NaN.
   */
  public static isValidNumber(val: unknown): val is number {
    return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val);
  }

  /**
   * Validates if a Vector3D object has valid numerical coordinates.
   */
  public static isValidVector3(vec: unknown): vec is Vector3D {
    if (!vec || typeof vec !== 'object') {
      return false;
    }
    const v = vec as Record<string, unknown>;
    return (
      Guardrails.isValidNumber(v.x) &&
      Guardrails.isValidNumber(v.y) &&
      Guardrails.isValidNumber(v.z)
    );
  }

  /**
   * Validates if a Transform3D has valid position, rotation, and non-zero positive scale.
   */
  public static isValidTransform(transform: unknown): transform is Transform3D {
    if (!transform || typeof transform !== 'object') {
      return false;
    }
    const t = transform as Record<string, unknown>;
    if (!Guardrails.isValidVector3(t.position) || !Guardrails.isValidVector3(t.rotation) || !Guardrails.isValidVector3(t.scale)) {
      return false;
    }
    const s = t.scale as Vector3D;
    return s.x > 0 && s.y > 0 && s.z > 0;
  }

  /**
   * Validates that an AABB bounding box has min <= max across all axes.
   */
  public static isValidAABB(aabb: unknown): aabb is AABB3D {
    if (!aabb || typeof aabb !== 'object') {
      return false;
    }
    const box = aabb as Record<string, unknown>;
    if (!Guardrails.isValidVector3(box.min) || !Guardrails.isValidVector3(box.max)) {
      return false;
    }
    const min = box.min as Vector3D;
    const max = box.max as Vector3D;
    return min.x <= max.x && min.y <= max.y && min.z <= max.z;
  }

  /**
   * Strict null and undefined check with contextual exception or logging.
   */
  public static assertNonNull<T>(value: T | null | undefined, contextMessage: string): T {
    if (value === null || value === undefined) {
      throw new Error(`[Guardrails Assertion Failed] Critical null/undefined reference: ${contextMessage}`);
    }
    return value;
  }

  /**
   * Sanitizes a Vector3D against NaNs or infinite values.
   */
  public static sanitizeVector3(
    vec: Partial<Vector3D> | null | undefined,
    fallback: Vector3D = { x: 0, y: 0, z: 0 }
  ): Vector3D {
    if (!vec) {
      return { ...fallback };
    }
    return {
      x: Guardrails.isValidNumber(vec.x) ? vec.x : fallback.x,
      y: Guardrails.isValidNumber(vec.y) ? vec.y : fallback.y,
      z: Guardrails.isValidNumber(vec.z) ? vec.z : fallback.z,
    };
  }

  /**
   * Clamps and sanitizes a numerical value within strict bounds.
   */
  public static sanitizeNumber(
    value: unknown,
    min: number,
    max: number,
    fallback: number
  ): number {
    if (!Guardrails.isValidNumber(value)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Safe execution wrapper preventing system crash while logging the stack trace.
   */
  public static safeExecute<T>(action: () => T, fallback: T, systemContext: string): T {
    try {
      return action();
    } catch (error) {
      console.error(`[Guardrails Exception Caught in ${systemContext}]:`, error);
      return fallback;
    }
  }
}
