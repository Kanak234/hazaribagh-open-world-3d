/**
 * Decoupled Fixed 60Hz Physics Simulation World.
 * Solves ground raycasts, static geometry colliders, gravity, and Swept AABB collision responses.
 */
import { CoordinateProjection } from '../gis/CoordinateProjection';
import { SweptAABB } from './SweptAABB';
import { Guardrails } from '../core/Guardrails';
export class PhysicsWorld {
    static GRAVITY = -9.81; // m/s^2
    colliders = new Map();
    /**
     * Registers a static world collider (e.g., building, roadside structure).
     */
    addCollider(collider) {
        if (!Guardrails.isValidAABB(collider.aabb)) {
            return;
        }
        this.colliders.set(collider.id, collider);
    }
    removeCollider(id) {
        this.colliders.delete(id);
    }
    clearColliders() {
        this.colliders.clear();
    }
    /**
     * Samples terrain elevation and calculates analytical ground normal.
     */
    sampleGround(x, z) {
        const h = CoordinateProjection.calculateTopographicElevation(x, z);
        // Finite differences to compute surface gradient
        const delta = 0.5;
        const hx = CoordinateProjection.calculateTopographicElevation(x + delta, z) - CoordinateProjection.calculateTopographicElevation(x - delta, z);
        const hz = CoordinateProjection.calculateTopographicElevation(x, z + delta) - CoordinateProjection.calculateTopographicElevation(x, z - delta);
        // Normal = normalize(-hx, 2 * delta, -hz)
        const nx = -hx;
        const ny = 2.0 * delta;
        const nz = -hz;
        const len = Math.hypot(nx, ny, nz);
        return {
            height: h,
            normal: {
                x: nx / len,
                y: ny / len,
                z: nz / len,
            },
        };
    }
    /**
     * Raycasts vertically downward against the terrain to find ground contact.
     */
    raycastGround(origin, maxDistance = 50) {
        const ground = this.sampleGround(origin.x, origin.z);
        const distance = origin.y - ground.height;
        if (distance >= 0 && distance <= maxDistance) {
            return {
                hit: true,
                distance,
                point: { x: origin.x, y: ground.height, z: origin.z },
                normal: ground.normal,
                colliderId: 'terrain',
            };
        }
        return {
            hit: false,
            distance: maxDistance,
            point: { x: origin.x, y: origin.y - maxDistance, z: origin.z },
            normal: { x: 0, y: 1, z: 0 },
            colliderId: null,
        };
    }
    /**
     * Resolves moving entity AABB against all static colliders using Swept AABB.
     * Performs slide projection along contact normal to prevent wall sticking.
     */
    moveAndSlide(box, displacement, maxIterations = 3) {
        let remaining = { ...displacement };
        let totalMoved = { x: 0, y: 0, z: 0 };
        let hitAny = false;
        let groundContact = false;
        let currentBox = {
            min: { ...box.min },
            max: { ...box.max },
        };
        for (let iter = 0; iter < maxIterations; iter++) {
            if (Math.hypot(remaining.x, remaining.y, remaining.z) < 1e-4) {
                break;
            }
            let closestHit = null;
            for (const collider of this.colliders.values()) {
                const hit = SweptAABB.sweep(currentBox, remaining, collider.aabb, collider.id);
                if (hit.hit) {
                    if (!closestHit || hit.time < closestHit.time) {
                        closestHit = hit;
                    }
                }
            }
            if (!closestHit) {
                // No obstacle hit: move full remaining distance
                totalMoved.x += remaining.x;
                totalMoved.y += remaining.y;
                totalMoved.z += remaining.z;
                break;
            }
            hitAny = true;
            const safeTime = Math.max(0.0, closestHit.time - 0.001);
            // Advance box by allowed distance
            const advanceX = remaining.x * safeTime;
            const advanceY = remaining.y * safeTime;
            const advanceZ = remaining.z * safeTime;
            totalMoved.x += advanceX;
            totalMoved.y += advanceY;
            totalMoved.z += advanceZ;
            currentBox.min.x += advanceX;
            currentBox.min.y += advanceY;
            currentBox.min.z += advanceZ;
            currentBox.max.x += advanceX;
            currentBox.max.y += advanceY;
            currentBox.max.z += advanceZ;
            if (closestHit.normal.y > 0.6) {
                groundContact = true;
            }
            // Project remaining displacement onto sliding plane
            const leftoverX = remaining.x * (1.0 - safeTime);
            const leftoverY = remaining.y * (1.0 - safeTime);
            const leftoverZ = remaining.z * (1.0 - safeTime);
            const dot = leftoverX * closestHit.normal.x + leftoverY * closestHit.normal.y + leftoverZ * closestHit.normal.z;
            remaining.x = leftoverX - dot * closestHit.normal.x;
            remaining.y = leftoverY - dot * closestHit.normal.y;
            remaining.z = leftoverZ - dot * closestHit.normal.z;
        }
        return {
            finalDisplacement: totalMoved,
            hitCollider: hitAny,
            groundContact,
        };
    }
}
