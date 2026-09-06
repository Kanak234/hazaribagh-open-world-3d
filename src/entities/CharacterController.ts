/**
 * Character Locomotion Controller & Finite State Machine.
 * States: IDLE, JOG, SPRINT, VAULT, ENTER_VEHICLE, IN_VEHICLE, EXIT_VEHICLE.
 * Uses Swept AABB continuous collision detection against world geometry.
 */

import * as THREE from 'three';
import { AABB3D, CharacterStateType, PlayerInputState, Vector3D } from '../core/Types';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { RaycastVehicle } from '../physics/RaycastVehicle';
import { Guardrails } from '../core/Guardrails';

export class CharacterController {
  public state: CharacterStateType = 'IDLE';

  // Locomotion constants
  private readonly JOG_SPEED = 5.0; // m/s (~18 km/h)
  private readonly SPRINT_SPEED = 9.5; // m/s (~34 km/h)
  private readonly VAULT_SPEED = 4.0;
  private readonly ACCELERATION = 18.0; // m/s^2
  private readonly ROTATION_SPEED = 14.0;

  // Collision box dimensions (meters)
  public readonly charWidth = 0.6;
  public readonly charHeight = 1.8;
  public readonly charDepth = 0.6;

  // Spatial states
  public position: THREE.Vector3 = new THREE.Vector3();
  public previousPosition: THREE.Vector3 = new THREE.Vector3();
  public interpolatedPosition: THREE.Vector3 = new THREE.Vector3();
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public rotationY: number = 0;

  public isGrounded: boolean = true;
  private vaultTimer: number = 0;
  private transitionTimer: number = 0;

  // Visual mesh representation
  public mesh: THREE.Group;
  private bodyMesh: THREE.Mesh;
  private headMesh: THREE.Mesh;

  private physicsWorld: PhysicsWorld;
  public activeVehicle: RaycastVehicle | null = null;

  constructor(physicsWorld: PhysicsWorld, spawnPosition: Vector3D) {
    this.physicsWorld = Guardrails.assertNonNull(physicsWorld, 'PhysicsWorld reference');
    this.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    this.previousPosition.copy(this.position);
    this.interpolatedPosition.copy(this.position);

    // Build character visual mesh
    this.mesh = new THREE.Group();

    // Body (GTA style protagonist aesthetic)
    const bodyGeom = new THREE.CapsuleGeometry(this.charWidth * 0.45, this.charHeight * 0.65, 8, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1f4068, // Dark leather jacket
      roughness: 0.6,
      metalness: 0.2,
    });
    this.bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    this.bodyMesh.position.y = this.charHeight * 0.5;
    this.bodyMesh.castShadow = true;
    this.mesh.add(this.bodyMesh);

    // Head
    const headGeom = new THREE.SphereGeometry(0.22, 12, 12);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xe0a96d,
      roughness: 0.8,
    });
    this.headMesh = new THREE.Mesh(headGeom, headMat);
    this.headMesh.position.y = this.charHeight * 0.95;
    this.headMesh.castShadow = true;
    this.mesh.add(this.headMesh);

    this.mesh.position.copy(this.position);
  }

  /**
   * Fixed 60Hz Physics step (_physics_process).
   */
  public physicsStep(
    fixedDt: number,
    input: PlayerInputState,
    cameraYaw: number,
    nearbyVehicles: RaycastVehicle[]
  ): void {
    this.previousPosition.copy(this.position);

    // 1. Vehicle entry/exit trigger handling
    if (input.enterExitVehicle) {
      this.handleVehicleInteract(nearbyVehicles);
    }

    // 2. State Machine dispatch
    switch (this.state) {
      case 'IN_VEHICLE':
        this.updateInVehicle(fixedDt, input);
        break;

      case 'ENTER_VEHICLE':
        this.updateEnteringVehicle(fixedDt);
        break;

      case 'EXIT_VEHICLE':
        this.updateExitingVehicle(fixedDt);
        break;

      case 'VAULT':
        this.updateVault(fixedDt);
        break;

      case 'IDLE':
      case 'JOG':
      case 'SPRINT':
        this.updateOnFoot(fixedDt, input, cameraYaw);
        break;
    }
  }

  private handleVehicleInteract(nearbyVehicles: RaycastVehicle[]): void {
    if (this.state === 'IN_VEHICLE' && this.activeVehicle) {
      // Exit vehicle
      this.state = 'EXIT_VEHICLE';
      this.transitionTimer = 0.5;
      return;
    }

    if (this.state === 'IDLE' || this.state === 'JOG' || this.state === 'SPRINT') {
      // Find nearest vehicle within 3.5 meters
      let closest: RaycastVehicle | null = null;
      let minDist = 3.8;

      for (const veh of nearbyVehicles) {
        const d = this.position.distanceTo(veh.position);
        if (d < minDist) {
          minDist = d;
          closest = veh;
        }
      }

      if (closest) {
        this.activeVehicle = closest;
        this.state = 'ENTER_VEHICLE';
        this.transitionTimer = 0.6;
      }
    }
  }

  private updateInVehicle(_fixedDt: number, input: PlayerInputState): void {
    if (!this.activeVehicle) {
      this.state = 'IDLE';
      return;
    }

    // Forward inputs to active vehicle
    this.activeVehicle.throttleInput = input.moveForward;
    this.activeVehicle.steeringInput = input.moveRight;
    this.activeVehicle.handbrakeInput = input.handbrake;

    // Follow vehicle position
    this.position.copy(this.activeVehicle.position);
    this.mesh.visible = false; // Player is inside car
  }

  private updateEnteringVehicle(fixedDt: number): void {
    this.transitionTimer -= fixedDt;
    if (this.activeVehicle) {
      this.position.lerp(this.activeVehicle.position, 0.15);
    }
    if (this.transitionTimer <= 0) {
      this.state = 'IN_VEHICLE';
      this.mesh.visible = false;
    }
  }

  private updateExitingVehicle(fixedDt: number): void {
    this.transitionTimer -= fixedDt;
    if (this.activeVehicle) {
      // Step out to the driver's side (left)
      const leftDir = new THREE.Vector3(-1, 0, 0).applyQuaternion(this.activeVehicle.quaternion);
      this.position.copy(this.activeVehicle.position).addScaledVector(leftDir, 2.2);
      this.activeVehicle.throttleInput = 0;
      this.activeVehicle.steeringInput = 0;
      this.activeVehicle.handbrakeInput = true;
    }

    if (this.transitionTimer <= 0) {
      this.activeVehicle = null;
      this.state = 'IDLE';
      this.mesh.visible = true;
      this.velocity.set(0, 0, 0);
    }
  }

  private updateVault(fixedDt: number): void {
    this.vaultTimer -= fixedDt;
    const forwardDir = new THREE.Vector3(-Math.sin(this.rotationY), 0, -Math.cos(this.rotationY));
    this.position.addScaledVector(forwardDir, this.VAULT_SPEED * fixedDt);
    this.position.y += 1.5 * fixedDt;

    if (this.vaultTimer <= 0) {
      this.state = 'JOG';
    }
  }

  private updateOnFoot(fixedDt: number, input: PlayerInputState, cameraYaw: number): void {
    this.mesh.visible = true;

    // Determine target movement direction aligned with camera view
    const moveZ = -input.moveForward;
    const moveX = input.moveRight;
    const hasInput = Math.hypot(moveX, moveZ) > 0.1;

    let targetSpeed = 0;
    if (hasInput) {
      targetSpeed = input.sprint ? this.SPRINT_SPEED : this.JOG_SPEED;
      this.state = input.sprint ? 'SPRINT' : 'JOG';
    } else {
      this.state = 'IDLE';
    }

    // Direction relative to camera orientation
    const camAngle = cameraYaw;
    const inputAngle = Math.atan2(moveX, moveZ);
    const moveAngle = camAngle + inputAngle;

    const desiredVel = new THREE.Vector3();
    if (hasInput) {
      desiredVel.x = Math.sin(moveAngle) * targetSpeed;
      desiredVel.z = Math.cos(moveAngle) * targetSpeed;

      // Smoothly rotate character to face moving direction
      const diff = Math.atan2(Math.sin(moveAngle - this.rotationY), Math.cos(moveAngle - this.rotationY));
      this.rotationY += diff * Math.min(1.0, this.ROTATION_SPEED * fixedDt);
    }

    // Smooth horizontal acceleration
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, desiredVel.x, this.ACCELERATION, fixedDt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, desiredVel.z, this.ACCELERATION, fixedDt);

    // Jump handling
    if (input.jump && this.isGrounded) {
      this.velocity.y = 6.2; // Initial jump impulse
      this.isGrounded = false;
    }

    // Apply gravity
    this.velocity.y += PhysicsWorld.GRAVITY * fixedDt;

    // Calculate displacement for Swept AABB
    const displacement: Vector3D = {
      x: this.velocity.x * fixedDt,
      y: this.velocity.y * fixedDt,
      z: this.velocity.z * fixedDt,
    };

    const halfW = this.charWidth * 0.5;
    const halfD = this.charDepth * 0.5;
    const playerAABB: AABB3D = {
      min: { x: this.position.x - halfW, y: this.position.y, z: this.position.z - halfD },
      max: { x: this.position.x + halfW, y: this.position.y + this.charHeight, z: this.position.z + halfD },
    };

    // Solve collision using moveAndSlide
    const resolution = this.physicsWorld.moveAndSlide(playerAABB, displacement);

    this.position.x += resolution.finalDisplacement.x;
    this.position.y += resolution.finalDisplacement.y;
    this.position.z += resolution.finalDisplacement.z;

    // Ground clamping
    const ground = this.physicsWorld.sampleGround(this.position.x, this.position.z);
    if (this.position.y <= ground.height + 0.05) {
      this.position.y = ground.height;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = resolution.groundContact;
    }

    // Check for vaulting opportunity over small obstacles
    if (hasInput && resolution.hitCollider && this.isGrounded && input.jump) {
      this.state = 'VAULT';
      this.vaultTimer = 0.45;
    }
  }

  /**
   * Sub-frame alpha interpolation for rendering loop (_process).
   */
  public interpolateRenderTransform(alpha: number): void {
    if (this.state === 'IN_VEHICLE' && this.activeVehicle) {
      this.mesh.visible = false;
      return;
    }

    this.interpolatedPosition.lerpVectors(this.previousPosition, this.position, alpha);
    this.mesh.position.copy(this.interpolatedPosition);
    this.mesh.rotation.y = this.rotationY;

    // Running bobbing animation
    if (this.state === 'JOG' || this.state === 'SPRINT') {
      const bobFreq = this.state === 'SPRINT' ? 14 : 10;
      const bobAmp = this.state === 'SPRINT' ? 0.08 : 0.04;
      this.bodyMesh.position.y = this.charHeight * 0.5 + Math.sin(performance.now() * 0.001 * bobFreq) * bobAmp;
    } else {
      this.bodyMesh.position.y = this.charHeight * 0.5;
    }
  }

  public getSpeedKmh(): number {
    if (this.state === 'IN_VEHICLE' && this.activeVehicle) {
      return this.activeVehicle.getSpeedKmh();
    }
    return Math.round(Math.hypot(this.velocity.x, this.velocity.z) * 3.6);
  }
}
