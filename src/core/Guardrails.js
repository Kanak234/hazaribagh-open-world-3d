/**
 * Defensive Programming & Validation Guardrails.
 * Provides defensive runtime assertions, finite number checks, transformation sanitization,
 * and memory safety wrappers to eliminate NaN propagation, memory leaks, and loop crashes.
 */
export class Guardrails {
    /**
     * Asserts whether a given number is finite and non-NaN.
     */
    static isValidNumber(val) {
        return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val);
    }
    /**
     * Validates if a Vector3D object has valid numerical coordinates.
     */
    static isValidVector3(vec) {
        if (!vec || typeof vec !== 'object') {
            return false;
        }
        const v = vec;
        return (Guardrails.isValidNumber(v.x) &&
            Guardrails.isValidNumber(v.y) &&
            Guardrails.isValidNumber(v.z));
    }
    /**
     * Validates if a Transform3D has valid position, rotation, and non-zero positive scale.
     */
    static isValidTransform(transform) {
        if (!transform || typeof transform !== 'object') {
            return false;
        }
        const t = transform;
        if (!Guardrails.isValidVector3(t.position) || !Guardrails.isValidVector3(t.rotation) || !Guardrails.isValidVector3(t.scale)) {
            return false;
        }
        const s = t.scale;
        return s.x > 0 && s.y > 0 && s.z > 0;
    }
    /**
     * Validates that an AABB bounding box has min <= max across all axes.
     */
    static isValidAABB(aabb) {
        if (!aabb || typeof aabb !== 'object') {
            return false;
        }
        const box = aabb;
        if (!Guardrails.isValidVector3(box.min) || !Guardrails.isValidVector3(box.max)) {
            return false;
        }
        const min = box.min;
        const max = box.max;
        return min.x <= max.x && min.y <= max.y && min.z <= max.z;
    }
    /**
     * Strict null and undefined check with contextual exception or logging.
     */
    static assertNonNull(value, contextMessage) {
        if (value === null || value === undefined) {
            throw new Error(`[Guardrails Assertion Failed] Critical null/undefined reference: ${contextMessage}`);
        }
        return value;
    }
    /**
     * Sanitizes a Vector3D against NaNs or infinite values.
     */
    static sanitizeVector3(vec, fallback = { x: 0, y: 0, z: 0 }) {
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
    static sanitizeNumber(value, min, max, fallback) {
        if (!Guardrails.isValidNumber(value)) {
            return fallback;
        }
        return Math.max(min, Math.min(max, value));
    }
    /**
     * Safe execution wrapper preventing system crash while logging the stack trace.
     */
    static safeExecute(action, fallback, systemContext) {
        try {
            return action();
        }
        catch (error) {
            console.error(`[Guardrails Exception Caught in ${systemContext}]:`, error);
            return fallback;
        }
    }
}
