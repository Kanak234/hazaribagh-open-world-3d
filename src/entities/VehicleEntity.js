/**
 * 3D Vehicle Visual Representation & Rendering Entity.
 * Renders the vehicle body, cabin glass, active brake lights, dynamic steering wheels,
 * and headlight spotlights illuminating Hazaribagh streets.
 */
import * as THREE from 'three';
import { Guardrails } from '../core/Guardrails';
export class VehicleEntity {
    vehicle;
    group;
    chassisMesh;
    cabinMesh;
    wheelMeshes = [];
    brakeLightMeshes = [];
    brakeLightMaterial;
    headlightLeft;
    headlightRight;
    constructor(vehicle, bodyColorHex = 0xd90429) {
        this.vehicle = Guardrails.assertNonNull(vehicle, 'RaycastVehicle in VehicleEntity');
        this.group = new THREE.Group();
        const dims = this.vehicle.config.dimensions;
        // 1. Aerodynamic Sports Car Chassis
        const chassisGeom = new THREE.BoxGeometry(dims.z * 0.95, dims.y * 0.45, dims.x * 0.98);
        const chassisMat = new THREE.MeshStandardMaterial({
            color: bodyColorHex,
            roughness: 0.25,
            metalness: 0.85,
        });
        this.chassisMesh = new THREE.Mesh(chassisGeom, chassisMat);
        this.chassisMesh.castShadow = true;
        this.chassisMesh.receiveShadow = true;
        this.chassisMesh.position.y = 0.2;
        this.group.add(this.chassisMesh);
        // 2. Cabin / Glass Canopy
        const cabinGeom = new THREE.BoxGeometry(dims.z * 0.82, dims.y * 0.38, dims.x * 0.52);
        const cabinMat = new THREE.MeshStandardMaterial({
            color: 0x111625,
            roughness: 0.1,
            metalness: 0.9,
        });
        this.cabinMesh = new THREE.Mesh(cabinGeom, cabinMat);
        this.cabinMesh.position.set(0, dims.y * 0.52, -dims.x * 0.05);
        this.cabinMesh.castShadow = true;
        this.group.add(this.cabinMesh);
        // 3. Headlights (Beams)
        this.headlightLeft = new THREE.SpotLight(0xffffff, 8.0, 60, Math.PI / 6, 0.4);
        this.headlightLeft.position.set(-dims.z * 0.35, 0.2, -dims.x * 0.5);
        this.headlightLeft.target.position.set(-dims.z * 0.35, -0.5, -dims.x * 0.5 - 20);
        this.group.add(this.headlightLeft);
        this.group.add(this.headlightLeft.target);
        this.headlightRight = new THREE.SpotLight(0xffffff, 8.0, 60, Math.PI / 6, 0.4);
        this.headlightRight.position.set(dims.z * 0.35, 0.2, -dims.x * 0.5);
        this.headlightRight.target.position.set(dims.z * 0.35, -0.5, -dims.x * 0.5 - 20);
        this.group.add(this.headlightRight);
        this.group.add(this.headlightRight.target);
        // 4. Brake lights
        this.brakeLightMaterial = new THREE.MeshStandardMaterial({
            color: 0x550000,
            emissive: 0x220000,
            roughness: 0.3,
        });
        const brakeGeom = new THREE.BoxGeometry(0.35, 0.15, 0.08);
        const brakeLeft = new THREE.Mesh(brakeGeom, this.brakeLightMaterial);
        brakeLeft.position.set(-dims.z * 0.38, 0.25, dims.x * 0.5);
        this.group.add(brakeLeft);
        this.brakeLightMeshes.push(brakeLeft);
        const brakeRight = new THREE.Mesh(brakeGeom, this.brakeLightMaterial);
        brakeRight.position.set(dims.z * 0.38, 0.25, dims.x * 0.5);
        this.group.add(brakeRight);
        this.brakeLightMeshes.push(brakeRight);
        // 5. Wheels
        this.buildWheels();
    }
    buildWheels() {
        const radius = this.vehicle.config.wheelRadius;
        const width = 0.3;
        const tireGeom = new THREE.CylinderGeometry(radius, radius, width, 18);
        tireGeom.rotateZ(Math.PI / 2);
        const tireMat = new THREE.MeshStandardMaterial({
            color: 0x181818,
            roughness: 0.9,
            metalness: 0.1,
        });
        const rimGeom = new THREE.CylinderGeometry(radius * 0.65, radius * 0.65, width * 1.02, 12);
        rimGeom.rotateZ(Math.PI / 2);
        const rimMat = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.2,
            metalness: 0.8,
        });
        for (let i = 0; i < 4; i++) {
            const wheelGrp = new THREE.Group();
            const tireMesh = new THREE.Mesh(tireGeom, tireMat);
            tireMesh.castShadow = true;
            const rimMesh = new THREE.Mesh(rimGeom, rimMat);
            wheelGrp.add(tireMesh);
            wheelGrp.add(rimMesh);
            this.wheelMeshes.push(wheelGrp);
            this.group.add(wheelGrp);
        }
    }
    /**
     * Updates rendering transform with sub-frame alpha interpolation (_process).
     */
    updateRender(alpha) {
        const interpolated = this.vehicle.interpolateRenderTransform(alpha);
        this.group.position.copy(interpolated.position);
        this.group.quaternion.copy(interpolated.quaternion);
        // Update wheel meshes relative to chassis
        const invChassisQuat = this.group.quaternion.clone().invert();
        for (let i = 0; i < this.vehicle.wheels.length; i++) {
            const wheelState = this.vehicle.wheels[i];
            const wheelMesh = this.wheelMeshes[i];
            // Convert world wheel position to local chassis coordinates
            const relPos = wheelState.worldPosition.clone().sub(this.group.position);
            relPos.applyQuaternion(invChassisQuat);
            wheelMesh.position.copy(relPos);
            // Apply steering & spin rotation
            wheelMesh.rotation.set(0, 0, 0);
            wheelMesh.rotation.y = wheelState.steerAngle;
            wheelMesh.rotation.x = wheelState.rotationAngle;
        }
        // Dynamic brake light glow
        const isBraking = this.vehicle.throttleInput < -0.1 || this.vehicle.handbrakeInput;
        if (isBraking) {
            this.brakeLightMaterial.color.setHex(0xff0000);
            this.brakeLightMaterial.emissive.setHex(0xff0000);
        }
        else {
            this.brakeLightMaterial.color.setHex(0x550000);
            this.brakeLightMaterial.emissive.setHex(0x220000);
        }
    }
    destroy() {
        this.group.clear();
        this.chassisMesh.geometry.dispose();
        this.cabinMesh.geometry.dispose();
    }
}
