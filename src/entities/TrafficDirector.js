/**
 * Autonomous Civilian Traffic Director.
 * Controls civilian AI vehicles navigating real Hazaribagh road network via RoadGraph & A*.
 * Performs forward obstacle sensing, traffic lane following, and speed regulation.
 */
import * as THREE from 'three';
import { RaycastVehicle } from '../physics/RaycastVehicle';
import { VehicleEntity } from './VehicleEntity';
import { Guardrails } from '../core/Guardrails';
export class TrafficDirector {
    scene;
    physicsWorld;
    roadGraph;
    pathfinder;
    civilians = [];
    civilianHandling = {
        id: 'civilian_sedan',
        name: 'Hazaribagh Civilian Cruiser',
        mass: 1400,
        dimensions: { x: 4.4, y: 1.4, z: 1.9 },
        driveType: 'FWD',
        engineForce: 4500,
        brakingDeceleration: 7000,
        reverseForce: 2500,
        maxSteerAngle: 0.55,
        steerSpeed: 8.0,
        suspensionRestLength: 0.45,
        suspensionStiffness: 26000,
        suspensionDamping: 2400,
        suspensionTravel: 0.22,
        wheelRadius: 0.34,
        tireGripForward: 2.2,
        tireGripSide: 2.5,
        driftFactor: 0.4,
        centerOfMassOffset: { x: 0, y: -0.2, z: 0 },
        rollInfluence: 0.7,
        dragCoefficient: 0.32,
        topSpeed: 22.0, // ~80 km/h max
    };
    constructor(scene, physicsWorld, roadGraph, pathfinder) {
        this.scene = Guardrails.assertNonNull(scene, 'Scene in TrafficDirector');
        this.physicsWorld = Guardrails.assertNonNull(physicsWorld, 'PhysicsWorld in TrafficDirector');
        this.roadGraph = Guardrails.assertNonNull(roadGraph, 'RoadGraph in TrafficDirector');
        this.pathfinder = Guardrails.assertNonNull(pathfinder, 'PathfindingAStar in TrafficDirector');
    }
    /**
     * Spawns a flock of civilian vehicles distributed across valid Hazaribagh road nodes.
     */
    spawnCivilianFleet(count = 8) {
        const nodes = this.roadGraph.getAllNodes();
        if (nodes.length < 2) {
            console.warn('[TrafficDirector] RoadGraph has insufficient nodes for civilian spawning.');
            return;
        }
        const civilianColors = [0x2b2d42, 0x8d99ae, 0xedf2f4, 0x0077b6, 0x588157, 0xf4a261];
        for (let i = 0; i < count; i++) {
            // Pick random road node
            const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
            const spawnPos = {
                x: randomNode.position.x,
                y: randomNode.position.y + 0.5,
                z: randomNode.position.z,
            };
            const veh = new RaycastVehicle(this.civilianHandling, this.physicsWorld, spawnPos);
            const color = civilianColors[i % civilianColors.length];
            const entity = new VehicleEntity(veh, color);
            this.scene.add(entity.group);
            const civ = {
                id: `civ_${i}`,
                vehicle: veh,
                entity,
                targetNodeId: null,
                pathWaypoints: [],
                currentWaypointIndex: 0,
                targetSpeed: 11.0 + Math.random() * 4.0, // ~40-55 km/h
            };
            this.assignNewRandomDestination(civ);
            this.civilians.push(civ);
        }
        console.log(`[TrafficDirector] Successfully spawned ${this.civilians.length} autonomous civilian vehicles.`);
    }
    /**
     * Fixed 60Hz physics update for all civilian vehicles.
     */
    physicsStep(fixedDt, playerVehicle, playerPos) {
        for (const civ of this.civilians) {
            // 1. Navigation AI
            this.updateCivilianAI(civ, playerVehicle, playerPos);
            // 2. Step vehicle physics simulation
            civ.vehicle.physicsStep(fixedDt);
        }
    }
    /**
     * Render update with sub-frame alpha interpolation.
     */
    updateRender(alpha) {
        for (const civ of this.civilians) {
            civ.entity.updateRender(alpha);
        }
    }
    updateCivilianAI(civ, playerVehicle, playerPos) {
        const veh = civ.vehicle;
        if (civ.pathWaypoints.length === 0 || civ.currentWaypointIndex >= civ.pathWaypoints.length) {
            this.assignNewRandomDestination(civ);
            return;
        }
        const currentTarget = civ.pathWaypoints[civ.currentWaypointIndex];
        const dx = currentTarget.x - veh.position.x;
        const dz = currentTarget.z - veh.position.z;
        const distToTarget = Math.hypot(dx, dz);
        if (distToTarget < 6.0) {
            civ.currentWaypointIndex++;
            if (civ.currentWaypointIndex >= civ.pathWaypoints.length) {
                this.assignNewRandomDestination(civ);
                return;
            }
        }
        // Steering towards waypoint
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(veh.quaternion);
        const toTarget = new THREE.Vector3(dx, 0, dz).normalize();
        // Cross product Y gives signed angle
        const crossY = forward.x * toTarget.z - forward.z * toTarget.x;
        veh.steeringInput = THREE.MathUtils.clamp(-crossY * 2.5, -1, 1);
        // Speed regulation & obstacle collision detection
        const currentSpeed = veh.linearVelocity.length();
        let brakeRequired = false;
        // Check distance to player
        const distToPlayer = veh.position.distanceTo(playerPos);
        if (distToPlayer < 9.0) {
            const dirToPlayer = playerPos.clone().sub(veh.position).normalize();
            if (forward.dot(dirToPlayer) > 0.6) {
                brakeRequired = true;
            }
        }
        // Check distance to player vehicle if active
        if (playerVehicle) {
            const distToPlayerVeh = veh.position.distanceTo(playerVehicle.position);
            if (distToPlayerVeh < 12.0) {
                const dirToPlayerVeh = playerVehicle.position.clone().sub(veh.position).normalize();
                if (forward.dot(dirToPlayerVeh) > 0.6) {
                    brakeRequired = true;
                }
            }
        }
        if (brakeRequired) {
            veh.throttleInput = -0.8; // Apply brakes
            veh.handbrakeInput = false;
        }
        else if (currentSpeed < civ.targetSpeed) {
            veh.throttleInput = 0.65; // Accelerate smoothly
            veh.handbrakeInput = false;
        }
        else {
            veh.throttleInput = 0.05; // Cruise
            veh.handbrakeInput = false;
        }
    }
    assignNewRandomDestination(civ) {
        const allNodes = this.roadGraph.getAllNodes();
        if (allNodes.length === 0)
            return;
        const startNode = this.roadGraph.findNearestNode({ x: civ.vehicle.position.x, y: civ.vehicle.position.y, z: civ.vehicle.position.z }, 200);
        if (!startNode)
            return;
        // Pick random target node ~400m to 1200m away
        let destNode = allNodes[Math.floor(Math.random() * allNodes.length)];
        const path = this.pathfinder.findPath(startNode.id, destNode.id);
        if (path.found && path.waypoints.length > 1) {
            civ.pathWaypoints = path.waypoints;
            civ.currentWaypointIndex = 1;
            civ.targetNodeId = destNode.id;
        }
    }
    getVehicles() {
        return this.civilians.map((c) => c.vehicle);
    }
    destroy() {
        for (const civ of this.civilians) {
            this.scene.remove(civ.entity.group);
            civ.entity.destroy();
        }
        this.civilians = [];
    }
}
