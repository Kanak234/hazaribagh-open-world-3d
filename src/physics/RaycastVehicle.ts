/**
 * Realistic Arcade-Simulation Vehicle Physics Engine (GTA handling.cfg Architecture).
 * Features 4-wheel raycast suspension, slip angle lateral drift friction,
 * RWD/FWD/AWD drive biases, anti-roll stabilization, and sub-frame alpha interpolation.
 */

import * as THREE from 'three';
import { HandlingConfig, Vector3D } from '../core/Types';
import { PhysicsWorld } from './PhysicsWorld';
import { Guardrails } from '../core/Guardrails';

export interface WheelState {
  id: 'FL' | 'FR' | 'RL' | 'RR';
  localOffset: THREE.Vector3;
  worldPosition: THREE.Vector3;
  isGrounded: boolean;
  suspensionCompression: number;
  suspensionLength: number;
  steerAngle: number;
  rotationSpeed: number; // Wheel spin in rad/s
  rotationAngle: number; // Accumulated spin angle
  skidFactor: number; // 0 (full grip) to 1 (full slip/drift)
}

export class RaycastVehicle {
  public config: HandlingConfig;
  private physicsWorld: PhysicsWorld;

  // Rigid body state
  public position: THREE.Vector3 = new THREE.Vector3();
  public previousPosition: THREE.Vector3 = new THREE.Vector3();
  public interpolatedPosition: THREE.Vector3 = new THREE.Vector3();

  public quaternion: THREE.Quaternion = new THREE.Quaternion();
  public previousQuaternion: THREE.Quaternion = new THREE.Quaternion();
  public interpolatedQuaternion: THREE.Quaternion = new THREE.Quaternion();

  public linearVelocity: THREE.Vector3 = new THREE.Vector3();
  public angularVelocity: THREE.Vector3 = new THREE.Vector3();

  // Wheels: Front-Left, Front-Right, Rear-Left, Rear-Right
  public wheels: WheelState[] = [];

  // Controls
  public throttleInput: number = 0; // -1 (reverse) to 1 (accelerate)
  public steeringInput: number = 0; // -1 (left) to 1 (right)
  public handbrakeInput: boolean = false;

  private currentSteerAngle: number = 0;

  constructor(config: HandlingConfig, physicsWorld: PhysicsWorld, spawnPos: Vector3D) {
    this.config = Guardrails.assertNonNull(config, 'HandlingConfig');
    this.physicsWorld = Guardrails.assertNonNull(physicsWorld, 'PhysicsWorld reference');

    this.position.set(spawnPos.x, spawnPos.y + 1.0, spawnPos.z);
    this.previousPosition.copy(this.position);
    this.interpolatedPosition.copy(this.position);

    this.quaternion.identity();
    this.previousQuaternion.identity();
    this.interpolatedQuaternion.identity();

    this.initWheels();
  }

  private initWheels(): void {
    const halfWidth = this.config.dimensions.z * 0.46;
    const halfLength = this.config.dimensions.x * 0.38;
    const mountY = -this.config.dimensions.y * 0.15;

    this.wheels = [
      {
        id: 'FL',
        localOffset: new THREE.Vector3(-halfWidth, mountY, -halfLength),
        worldPosition: new THREE.Vector3(),
        isGrounded: false,
        suspensionCompression: 0,
        suspensionLength: this.config.suspensionRestLength,
        steerAngle: 0,
        rotationSpeed: 0,
        rotationAngle: 0,
        skidFactor: 0,
      },
      {
        id: 'FR',
        localOffset: new THREE.Vector3(halfWidth, mountY, -halfLength),
        worldPosition: new THREE.Vector3(),
        isGrounded: false,
        suspensionCompression: 0,
        suspensionLength: this.config.suspensionRestLength,
        steerAngle: 0,
        rotationSpeed: 0,
        rotationAngle: 0,
        skidFactor: 0,
      },
      {
        id: 'RL',
        localOffset: new THREE.Vector3(-halfWidth, mountY, halfLength),
        worldPosition: new THREE.Vector3(),
        isGrounded: false,
        suspensionCompression: 0,
        suspensionLength: this.config.suspensionRestLength,
        steerAngle: 0,
        rotationSpeed: 0,
        rotationAngle: 0,
        skidFactor: 0,
      },
      {
        id: 'RR',
        localOffset: new THREE.Vector3(halfWidth, mountY, halfLength),
        worldPosition: new THREE.Vector3(),
        isGrounded: false,
        suspensionCompression: 0,
        suspensionLength: this.config.suspensionRestLength,
        steerAngle: 0,
        rotationSpeed: 0,
        rotationAngle: 0,
        skidFactor: 0,
      },
    ];
  }

  /**
   * Fixed 60Hz Physics simulation step (_physics_process).
   */
  public physicsStep(fixedDt: number): void {
    // Preserve previous step for sub-frame alpha interpolation
    this.previousPosition.copy(this.position);
    this.previousQuaternion.copy(this.quaternion);

    // Apply smooth steering rate
    const targetSteer = -this.steeringInput * this.config.maxSteerAngle;
    this.currentSteerAngle = THREE.MathUtils.damp(
      this.currentSteerAngle,
      targetSteer,
      this.config.steerSpeed,
      fixedDt
    );

    this.wheels[0].steerAngle = this.currentSteerAngle;
    this.wheels[1].steerAngle = this.currentSteerAngle;

    // Chassis transformation basis vectors
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);

    // Total forces and torques acting on vehicle
    const netForce = new THREE.Vector3(0, PhysicsWorld.GRAVITY * this.config.mass, 0);
    const netTorque = new THREE.Vector3();

    // Aerodynamic drag
    const currentSpeed = this.linearVelocity.length();
    const dragMagnitude = 0.5 * this.config.dragCoefficient * currentSpeed * currentSpeed;
    const dragForce = this.linearVelocity.clone().normalize().multiplyScalar(-dragMagnitude);
    netForce.add(dragForce);

    let groundedWheelsCount = 0;

    // Simulate each wheel suspension and tire contact
    for (let i = 0; i < this.wheels.length; i++) {
      const wheel = this.wheels[i];
      const isFront = wheel.id === 'FL' || wheel.id === 'FR';

      // Wheel attachment point in world space
      const wheelWorldOffset = wheel.localOffset.clone().applyQuaternion(this.quaternion);
      const wheelMountWorld = this.position.clone().add(wheelWorldOffset);

      // Suspension raycast downward
      const maxSuspensionDistance = this.config.suspensionRestLength + this.config.suspensionTravel;
      const groundHit = this.physicsWorld.raycastGround(
        { x: wheelMountWorld.x, y: wheelMountWorld.y, z: wheelMountWorld.z },
        maxSuspensionDistance + this.config.wheelRadius
      );

      if (groundHit.hit) {
        wheel.isGrounded = true;
        groundedWheelsCount++;

        const currentLength = groundHit.distance - this.config.wheelRadius;
        const compression = Math.max(0, this.config.suspensionRestLength - currentLength);
        wheel.suspensionCompression = compression;
        wheel.suspensionLength = currentLength;

        // Position of wheel contact patch
        wheel.worldPosition.set(groundHit.point.x, groundHit.point.y + this.config.wheelRadius, groundHit.point.z);

        // Spring force F = -k * x
        const springForceMag = this.config.suspensionStiffness * compression;

        // Damping force F = -c * v_rel
        const wheelVelocity = this.getPointVelocity(wheelWorldOffset);
        const suspensionVelocity = wheelVelocity.dot(up);
        const damperForceMag = -this.config.suspensionDamping * suspensionVelocity;

        const suspensionNormalForce = Math.max(0, springForceMag + damperForceMag);
        const suspensionForce = up.clone().multiplyScalar(suspensionNormalForce);
        netForce.add(suspensionForce);

        // Torque caused by suspension force
        const suspensionTorque = wheelWorldOffset.clone().cross(suspensionForce);
        netTorque.add(suspensionTorque);

        // Wheel coordinate axes (accounting for steering angle)
        const wheelRot = this.quaternion.clone();
        if (isFront) {
          const steerQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), wheel.steerAngle);
          wheelRot.multiply(steerQuat);
        }
        const wheelForward = new THREE.Vector3(0, 0, -1).applyQuaternion(wheelRot);
        const wheelRight = new THREE.Vector3(1, 0, 0).applyQuaternion(wheelRot);

        // Wheel velocities
        const forwardVel = wheelVelocity.dot(wheelForward);
        const lateralVel = wheelVelocity.dot(wheelRight);

        // Drive torque application
        let driveApplied = 0;
        const isDrivenWheel =
          this.config.driveType === 'AWD' ||
          (this.config.driveType === 'RWD' && !isFront) ||
          (this.config.driveType === 'FWD' && isFront);

        if (isDrivenWheel && currentSpeed < this.config.topSpeed) {
          if (this.throttleInput > 0) {
            driveApplied = this.throttleInput * (this.config.engineForce / (this.config.driveType === 'AWD' ? 4 : 2));
          } else if (this.throttleInput < 0) {
            driveApplied = this.throttleInput * (this.config.reverseForce / 2);
          }
        }

        // Braking torque
        let brakeApplied = 0;
        if (this.throttleInput < 0 && forwardVel > 1.0) {
          brakeApplied = -this.config.brakingDeceleration * Math.sign(forwardVel);
        }

        const driveForceVec = wheelForward.clone().multiplyScalar(driveApplied + brakeApplied);
        netForce.add(driveForceVec);

        // Lateral cornering friction (Drifting physics)
        let lateralGrip = this.config.tireGripSide;
        if (this.handbrakeInput) {
          // Handbrake drift unlocks the rear wheels for power-sliding
          if (!isFront) {
            lateralGrip *= this.config.driftFactor;
            wheel.skidFactor = 1.0;
          } else {
            lateralGrip *= 0.65;
            wheel.skidFactor = 0.5;
          }
        } else {
          wheel.skidFactor = Math.min(1.0, Math.abs(lateralVel) / 8.0);
        }

        const lateralFrictionMag = -lateralVel * lateralGrip * (suspensionNormalForce * 0.05 + 100);
        const lateralForce = wheelRight.clone().multiplyScalar(lateralFrictionMag);
        netForce.add(lateralForce);

        const tireTorque = wheelWorldOffset.clone().cross(driveForceVec.clone().add(lateralForce));
        netTorque.add(tireTorque);

        // Update wheel spin rotation
        wheel.rotationSpeed = forwardVel / this.config.wheelRadius;
        wheel.rotationAngle += wheel.rotationSpeed * fixedDt;
      } else {
        wheel.isGrounded = false;
        wheel.suspensionCompression = 0;
        wheel.suspensionLength = maxSuspensionDistance;
        wheel.skidFactor = 0;
        wheel.worldPosition.copy(wheelMountWorld).add(new THREE.Vector3(0, -maxSuspensionDistance, 0));
      }
    }

    // Anti-roll bar torque stabilization
    if (groundedWheelsCount > 0) {
      const rollAngle = right.y; // Height difference between left and right
      const antiRollTorque = forward.clone().multiplyScalar(-rollAngle * this.config.rollInfluence * 15000);
      netTorque.add(antiRollTorque);

      // Pitch stabilization
      const pitchAngle = forward.y;
      const antiPitchTorque = right.clone().multiplyScalar(-pitchAngle * 10000);
      netTorque.add(antiPitchTorque);

      // Angular damping
      this.angularVelocity.multiplyScalar(0.92);
    }

    // Integrate linear acceleration & velocity
    const linearAcceleration = netForce.divideScalar(this.config.mass);
    this.linearVelocity.addScaledVector(linearAcceleration, fixedDt);

    // Integrate angular acceleration & velocity
    const momentOfInertia = (this.config.mass * (this.config.dimensions.x ** 2 + this.config.dimensions.z ** 2)) / 12;
    const angularAcceleration = netTorque.divideScalar(momentOfInertia);
    this.angularVelocity.addScaledVector(angularAcceleration, fixedDt);

    // Update position
    this.position.addScaledVector(this.linearVelocity, fixedDt);

    // Update orientation quaternion
    const angDelta = this.angularVelocity.clone().multiplyScalar(fixedDt);
    const angLen = angDelta.length();
    if (angLen > 1e-6) {
      const rotQuat = new THREE.Quaternion().setFromAxisAngle(angDelta.clone().normalize(), angLen);
      this.quaternion.premultiply(rotQuat).normalize();
    }

    // Ground clamp if submerged below terrain
    const centerGround = this.physicsWorld.sampleGround(this.position.x, this.position.z);
    const minAllowedY = centerGround.height + this.config.wheelRadius + 0.2;
    if (this.position.y < minAllowedY) {
      this.position.y = minAllowedY;
      if (this.linearVelocity.y < 0) {
        this.linearVelocity.y = 0;
      }
    }
  }

  /**
   * Sub-frame alpha interpolation for rendering loop (_process).
   */
  public interpolateRenderTransform(alpha: number): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
    this.interpolatedPosition.lerpVectors(this.previousPosition, this.position, alpha);
    this.interpolatedQuaternion.slerpQuaternions(this.previousQuaternion, this.quaternion, alpha);
    return {
      position: this.interpolatedPosition,
      quaternion: this.interpolatedQuaternion,
    };
  }

  private getPointVelocity(worldOffset: THREE.Vector3): THREE.Vector3 {
    const rotVel = new THREE.Vector3().crossVectors(this.angularVelocity, worldOffset);
    return this.linearVelocity.clone().add(rotVel);
  }

  public getSpeedKmh(): number {
    return Math.round(this.linearVelocity.length() * 3.6);
  }

  public setPosition(pos: Vector3D, yawRadians: number = 0): void {
    this.position.set(pos.x, pos.y, pos.z);
    this.previousPosition.copy(this.position);
    this.interpolatedPosition.copy(this.position);

    this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawRadians);
    this.previousQuaternion.copy(this.quaternion);
    this.interpolatedQuaternion.copy(this.quaternion);

    this.linearVelocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
  }
}
