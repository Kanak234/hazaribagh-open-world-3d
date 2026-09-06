/**
 * Cinematic Third-Person Chase Camera (GTA V / Vice City Dynamics).
 * Features smooth position damping, velocity look-ahead, dynamic speed FOV expansion,
 * ground obstacle clearance, and seamless transitions between on-foot and vehicular modes.
 */
import * as THREE from 'three';
import { Guardrails } from '../core/Guardrails';
export class ChaseCameraController {
    camera;
    physicsWorld;
    // Camera settings
    targetDistance = 5.2;
    targetHeight = 2.0;
    lookAheadFactor = 0.35;
    baseFov = 60;
    maxSpeedFov = 74;
    // Orientation angles
    yaw = 0; // Radians
    pitch = 0.25; // Radians
    // Smoothed camera target and eye positions
    currentCameraPos = new THREE.Vector3();
    currentLookAt = new THREE.Vector3();
    constructor(camera, physicsWorld) {
        this.camera = Guardrails.assertNonNull(camera, 'Camera reference in ChaseCameraController');
        this.physicsWorld = Guardrails.assertNonNull(physicsWorld, 'PhysicsWorld in ChaseCameraController');
        this.currentCameraPos.copy(this.camera.position);
        this.currentLookAt.set(0, 1.5, 0);
    }
    /**
     * Mouse rotation input handler.
     */
    handleMouseMove(deltaX, deltaY, sensitivity = 0.0025) {
        this.yaw -= deltaX * sensitivity;
        this.pitch += deltaY * sensitivity;
        // Clamp pitch to prevent flipping
        this.pitch = THREE.MathUtils.clamp(this.pitch, -0.2, 1.2);
    }
    /**
     * Updates camera position and orientation during high-refresh render loop (_process).
     */
    update(delta, character, activeVehicle) {
        const isDriving = activeVehicle !== null && character.state === 'IN_VEHICLE';
        let targetPos;
        let targetVelocity;
        let speedKmh;
        if (isDriving) {
            targetPos = activeVehicle.interpolatedPosition;
            targetVelocity = activeVehicle.linearVelocity;
            speedKmh = activeVehicle.getSpeedKmh();
            this.targetDistance = 7.0;
            this.targetHeight = 2.4;
            // Auto-align camera yaw behind vehicle direction when moving forward
            const vehicleForward = new THREE.Vector3(0, 0, -1).applyQuaternion(activeVehicle.interpolatedQuaternion);
            const moveSpeed = targetVelocity.length();
            if (moveSpeed > 3.0) {
                const vehicleYaw = Math.atan2(vehicleForward.x, vehicleForward.z) + Math.PI;
                const diff = Math.atan2(Math.sin(vehicleYaw - this.yaw), Math.cos(vehicleYaw - this.yaw));
                this.yaw += diff * Math.min(1.0, 2.5 * delta);
            }
        }
        else {
            targetPos = character.interpolatedPosition;
            targetVelocity = character.velocity;
            speedKmh = character.getSpeedKmh();
            this.targetDistance = 4.2;
            this.targetHeight = 1.8;
        }
        // Dynamic speed FOV expansion
        const fovRatio = Math.min(1.0, speedKmh / 140.0);
        const targetFov = this.baseFov + (this.maxSpeedFov - this.baseFov) * fovRatio;
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 4.0);
        this.camera.updateProjectionMatrix();
        // Look-ahead vector based on velocity
        const lookAhead = targetVelocity.clone().multiplyScalar(this.lookAheadFactor);
        const desiredLookAt = targetPos.clone().add(new THREE.Vector3(0, this.targetHeight * 0.7, 0)).add(lookAhead);
        this.currentLookAt.lerp(desiredLookAt, Math.min(1.0, 10.0 * delta));
        // Spherical offset from yaw and pitch
        const horizontalDist = this.targetDistance * Math.cos(this.pitch);
        const verticalDist = this.targetDistance * Math.sin(this.pitch);
        const desiredCameraPos = new THREE.Vector3(targetPos.x + Math.sin(this.yaw) * horizontalDist, targetPos.y + this.targetHeight + verticalDist, targetPos.z + Math.cos(this.yaw) * horizontalDist);
        // Prevent camera from clipping through terrain
        const groundAtCam = this.physicsWorld.sampleGround(desiredCameraPos.x, desiredCameraPos.z);
        if (desiredCameraPos.y < groundAtCam.height + 0.8) {
            desiredCameraPos.y = groundAtCam.height + 0.8;
        }
        // Smooth camera lag
        const lerpSpeed = isDriving ? 8.0 : 14.0;
        this.currentCameraPos.lerp(desiredCameraPos, Math.min(1.0, lerpSpeed * delta));
        this.camera.position.copy(this.currentCameraPos);
        this.camera.lookAt(this.currentLookAt);
    }
}
