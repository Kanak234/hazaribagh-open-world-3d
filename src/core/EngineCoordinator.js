/**
 * Master Open-World Engine Coordinator.
 * Orchestrates the Three.js rendering pipeline, KalaChakra dual-loop lifecycle,
 * Spatial Octree streaming, real GIS ingestion, physics world, vehicle handling,
 * character locomotion, civilian traffic AI, and interactive HUD.
 */
import * as THREE from 'three';
import { KalaChakraLoop } from './KalaChakraLoop';
import { SpatialOctree } from './SpatialOctree';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { RealOsmLoader } from '../gis/RealOsmLoader';
import { TerrainRoadGenerator } from '../gis/TerrainRoadGenerator';
import { RoadGraph } from '../navigation/RoadGraph';
import { PathfindingAStar } from '../navigation/PathfindingAStar';
import { RaycastVehicle } from '../physics/RaycastVehicle';
import { VehicleEntity } from '../entities/VehicleEntity';
import { CharacterController } from '../entities/CharacterController';
import { TrafficDirector } from '../entities/TrafficDirector';
import { ChaseCameraController } from '../camera/ChaseCameraController';
import { GameHUD } from '../ui/GameHUD';
import { CoordinateProjection } from '../gis/CoordinateProjection';
import { Guardrails } from './Guardrails';
export class EngineCoordinator {
    // Rendering
    renderer;
    scene;
    camera;
    dirLight;
    hemiLight;
    // Master Decoupled Loop
    loop;
    // Core Subsystems
    octree;
    physicsWorld;
    osmLoader;
    terrainGenerator;
    roadGraph;
    pathfinder;
    // Entities & Controllers
    playerCharacter;
    playerVehicle;
    playerVehicleEntity;
    trafficDirector;
    cameraController;
    hud;
    // Active World Data
    worldData = null;
    cameraFrustum = new THREE.Frustum();
    projScreenMatrix = new THREE.Matrix4();
    // Input State
    inputState = {
        moveForward: 0,
        moveRight: 0,
        sprint: false,
        jump: false,
        enterExitVehicle: false,
        handbrake: false,
        mouseDeltaX: 0,
        mouseDeltaY: 0,
    };
    isPointerLocked = false;
    keydownListener;
    keyupListener;
    mousemoveListener;
    mousedownListener;
    resizeListener;
    // High-performance sports car handling profile (GTA Vice City Cheetah / Infernus style)
    playerVehicleHandling = {
        id: 'hazaribagh_gt_v8',
        name: 'Hazaribagh Predator GT V8',
        mass: 1450, // kg
        dimensions: { x: 4.6, y: 1.25, z: 2.0 },
        driveType: 'RWD', // Rear-Wheel-Drive for drift authority
        engineForce: 8500, // High acceleration torque
        brakingDeceleration: 11000,
        reverseForce: 4200,
        maxSteerAngle: 0.62, // ~36 degrees
        steerSpeed: 10.0,
        suspensionRestLength: 0.42,
        suspensionStiffness: 34000,
        suspensionDamping: 3200,
        suspensionTravel: 0.20,
        wheelRadius: 0.36,
        tireGripForward: 2.8,
        tireGripSide: 2.9,
        driftFactor: 0.28, // Slick drift multiplier under handbrake
        centerOfMassOffset: { x: 0, y: -0.28, z: 0.05 }, // Low COM
        rollInfluence: 0.85,
        dragCoefficient: 0.28,
        topSpeed: 52.0, // ~190 km/h
    };
    constructor() {
        console.log('[EngineCoordinator] Initializing Hazaribagh 3D Open-World Engine...');
        // 1. Renderer Setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        document.body.appendChild(this.renderer.domElement);
        // 2. Scene & Lighting Setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0c131f); // Dusk twilight over Jharkhand plateau
        this.scene.fog = new THREE.FogExp2(0x0c131f, 0.00065);
        this.hemiLight = new THREE.HemisphereLight(0x90b4ce, 0x1f2937, 0.65);
        this.scene.add(this.hemiLight);
        this.dirLight = new THREE.DirectionalLight(0xfff3b0, 1.4);
        this.dirLight.position.set(300, 500, 200);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.near = 10;
        this.dirLight.shadow.camera.far = 1200;
        this.dirLight.shadow.camera.left = -250;
        this.dirLight.shadow.camera.right = 250;
        this.dirLight.shadow.camera.top = 250;
        this.dirLight.shadow.camera.bottom = -250;
        this.scene.add(this.dirLight);
        // 3. Camera Setup
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.2, 5000);
        this.camera.position.set(0, 10, 20);
        // 4. Subsystems
        this.octree = new SpatialOctree({ min: { x: -6000, y: -200, z: -6000 }, max: { x: 6000, y: 1200, z: 6000 } });
        this.physicsWorld = new PhysicsWorld();
        this.osmLoader = new RealOsmLoader();
        this.terrainGenerator = new TerrainRoadGenerator(this.scene, this.octree);
        this.roadGraph = new RoadGraph();
        this.pathfinder = new PathfindingAStar(this.roadGraph);
        // 5. Initial Spawn Origin (Mahatma Gandhi Maidan, Hazaribagh)
        const spawnPos = { x: 0, y: 1.5, z: 0 };
        this.playerCharacter = new CharacterController(this.physicsWorld, spawnPos);
        this.scene.add(this.playerCharacter.mesh);
        // Player sports car spawned nearby on Gandhi Maidan road corridor
        const carSpawnPos = { x: 4.5, y: 1.5, z: 6.0 };
        this.playerVehicle = new RaycastVehicle(this.playerVehicleHandling, this.physicsWorld, carSpawnPos);
        this.playerVehicleEntity = new VehicleEntity(this.playerVehicle, 0xd90429);
        this.scene.add(this.playerVehicleEntity.group);
        // 6. Camera Controller & HUD
        this.cameraController = new ChaseCameraController(this.camera, this.physicsWorld);
        this.hud = new GameHUD();
        this.trafficDirector = new TrafficDirector(this.scene, this.physicsWorld, this.roadGraph, this.pathfinder);
        // 7. Decoupled Dual Loop (KalaChakra Pattern)
        this.loop = new KalaChakraLoop((fixedDt) => this.physicsProcess(fixedDt), (delta, alpha) => this.renderProcess(delta, alpha));
        // 8. Event Listeners & Defensive Handlers
        this.keydownListener = this.onKeyDown.bind(this);
        this.keyupListener = this.onKeyUp.bind(this);
        this.mousemoveListener = this.onMouseMove.bind(this);
        this.mousedownListener = this.onMouseDown.bind(this);
        this.resizeListener = this.onWindowResize.bind(this);
        this.registerEventListeners();
    }
    /**
     * Asynchronously loads real Hazaribagh geographic data and starts the engine.
     */
    async initialize() {
        try {
            console.log('[EngineCoordinator] Fetching real Hazaribagh GIS topology...');
            this.worldData = await this.osmLoader.loadData();
            // Build road network graph
            this.roadGraph.buildFromOsm(this.worldData.roads);
            // Generate 3D procedural world meshes (roads, lakes, Canary Hill terrain, buildings)
            this.terrainGenerator.generateWorld(this.worldData);
            // Populate navigation data in HUD
            this.hud.setNavigationData(this.roadGraph, this.worldData.landmarks);
            // Spawn civilian traffic fleet across real roads
            this.trafficDirector.spawnCivilianFleet(10);
            // Snap player and car to exact ground elevation
            this.snapEntitiesToGround();
            // Start the decoupled dual loop
            this.loop.start();
            console.log('[EngineCoordinator] Engine loop active. 60Hz Physics & unlocked WebGL rendering running.');
        }
        catch (err) {
            console.error('[EngineCoordinator] Critical initialization failure:', err);
        }
    }
    snapEntitiesToGround() {
        const charGround = this.physicsWorld.sampleGround(this.playerCharacter.position.x, this.playerCharacter.position.z);
        this.playerCharacter.position.y = charGround.height + 0.1;
        this.playerCharacter.previousPosition.copy(this.playerCharacter.position);
        const carGround = this.physicsWorld.sampleGround(this.playerVehicle.position.x, this.playerVehicle.position.z);
        this.playerVehicle.setPosition({
            x: this.playerVehicle.position.x,
            y: carGround.height + 0.5,
            z: this.playerVehicle.position.z,
        });
    }
    /**
     * Fixed 60Hz physics and vehicle simulation loop (_physics_process).
     */
    physicsProcess(fixedDt) {
        if (!this.playerCharacter || !this.playerVehicle) {
            return;
        }
        if (!Guardrails.isValidNumber(fixedDt) || fixedDt <= 0) {
            return;
        }
        // Gather all active vehicles for character interaction query
        const nearbyVehicles = [this.playerVehicle, ...this.trafficDirector.getVehicles()];
        // 1. Step Player Character Controller (locomotion state machine & Swept AABB)
        this.playerCharacter.physicsStep(fixedDt, this.inputState, this.cameraController.yaw, nearbyVehicles);
        // 2. Step Player Vehicle Physics (handling.cfg suspension, drift friction, motor torque)
        if (this.playerCharacter.state === 'IN_VEHICLE') {
            this.playerVehicle.physicsStep(fixedDt);
        }
        else {
            // Vehicle slows to a stop under handbrake if vacant
            this.playerVehicle.throttleInput = 0;
            this.playerVehicle.steeringInput = 0;
            this.playerVehicle.handbrakeInput = true;
            this.playerVehicle.physicsStep(fixedDt);
        }
        // 3. Step Autonomous Civilian Traffic AI
        const activeVeh = this.playerCharacter.state === 'IN_VEHICLE' ? this.playerVehicle : null;
        this.trafficDirector.physicsStep(fixedDt, activeVeh, this.playerCharacter.position);
        // Reset single-frame pulse inputs
        this.inputState.enterExitVehicle = false;
    }
    /**
     * Variable high-refresh rendering loop with sub-frame alpha interpolation (_process).
     */
    renderProcess(delta, alpha) {
        if (!this.playerCharacter || !this.playerVehicle) {
            return;
        }
        if (!Guardrails.isValidNumber(delta) || !Guardrails.isValidNumber(alpha)) {
            return;
        }
        const activeVeh = this.playerCharacter.state === 'IN_VEHICLE' ? this.playerVehicle : null;
        // 1. Interpolate character visual mesh
        this.playerCharacter.interpolateRenderTransform(alpha);
        // 2. Interpolate player vehicle visual mesh
        this.playerVehicleEntity.updateRender(alpha);
        // 3. Interpolate civilian traffic meshes
        this.trafficDirector.updateRender(alpha);
        // 4. Update Chase Camera position, velocity look-ahead, and speed FOV
        this.cameraController.update(delta, this.playerCharacter, activeVeh);
        // 5. Update directional sunlight to follow active player focus
        const focusPos = activeVeh ? activeVeh.interpolatedPosition : this.playerCharacter.interpolatedPosition;
        this.dirLight.position.set(focusPos.x + 250, focusPos.y + 400, focusPos.z + 180);
        this.dirLight.target.position.copy(focusPos);
        this.dirLight.target.updateMatrixWorld();
        // 6. Spatial Octree Frustum Culling Query
        this.projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        this.cameraFrustum.setFromProjectionMatrix(this.projScreenMatrix);
        const visibleItems = this.octree.queryFrustum(this.cameraFrustum);
        // 7. Update HUD Telemetry & GPS Radar
        const telemetry = this.loop.getTelemetry();
        const nearestLandmark = this.findNearestLandmark(focusPos);
        const fullTelemetry = {
            fps: telemetry.fps,
            physicsTickRateHz: telemetry.physicsHz,
            activeEntitiesCount: 2 + this.trafficDirector.getVehicles().length,
            octreeTotalNodes: this.octree.getTotalNodesCount(),
            visibleChunksCount: visibleItems.length,
            playerState: this.playerCharacter.state,
            playerPosition: { x: focusPos.x, y: focusPos.y, z: focusPos.z },
            playerSpeedKmh: this.playerCharacter.getSpeedKmh(),
            currentVehicleId: activeVeh ? activeVeh.config.id : null,
            nearestLandmarkName: nearestLandmark.name,
            nearestLandmarkDistance: nearestLandmark.distance,
            originGps: { lat: CoordinateProjection.ORIGIN_LAT, lon: CoordinateProjection.ORIGIN_LON },
        };
        const playerHeading = activeVeh
            ? Math.atan2(activeVeh.linearVelocity.x, activeVeh.linearVelocity.z)
            : this.playerCharacter.rotationY;
        this.hud.update(fullTelemetry, playerHeading);
        // 8. Render WebGL Frame
        this.renderer.render(this.scene, this.camera);
    }
    findNearestLandmark(pos) {
        if (!this.worldData || this.worldData.landmarks.length === 0) {
            return { name: 'Gandhi Maidan (Origin)', distance: pos.length() };
        }
        let nearest = this.worldData.landmarks[0];
        let minDist = Infinity;
        for (const lm of this.worldData.landmarks) {
            const d = Math.hypot(lm.worldPosition.x - pos.x, lm.worldPosition.z - pos.z);
            if (d < minDist) {
                minDist = d;
                nearest = lm;
            }
        }
        return { name: nearest.name, distance: minDist };
    }
    // --- Input Handlers ---
    onKeyDown(e) {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.inputState.moveForward = 1;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.inputState.moveForward = -1;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.inputState.moveRight = -1;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.inputState.moveRight = 1;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.inputState.sprint = true;
                break;
            case 'Space':
                this.inputState.jump = true;
                this.inputState.handbrake = true;
                break;
            case 'KeyF':
                this.inputState.enterExitVehicle = true;
                break;
            case 'KeyC':
                this.teleportToLandmark('Canary Hill');
                break;
            case 'KeyG':
                this.teleportToLandmark('Gandhi Maidan');
                break;
            case 'KeyL':
                this.teleportToLandmark('Hazaribagh');
                break;
        }
    }
    onKeyUp(e) {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                if (this.inputState.moveForward > 0)
                    this.inputState.moveForward = 0;
                break;
            case 'KeyS':
            case 'ArrowDown':
                if (this.inputState.moveForward < 0)
                    this.inputState.moveForward = 0;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                if (this.inputState.moveRight < 0)
                    this.inputState.moveRight = 0;
                break;
            case 'KeyD':
            case 'ArrowRight':
                if (this.inputState.moveRight > 0)
                    this.inputState.moveRight = 0;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.inputState.sprint = false;
                break;
            case 'Space':
                this.inputState.jump = false;
                this.inputState.handbrake = false;
                break;
        }
    }
    onMouseMove(e) {
        if (this.isPointerLocked) {
            this.cameraController.handleMouseMove(e.movementX, e.movementY);
        }
    }
    onMouseDown() {
        if (!this.isPointerLocked) {
            document.body.requestPointerLock?.();
            this.isPointerLocked = true;
        }
    }
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    teleportToLandmark(nameQuery) {
        if (!this.worldData)
            return;
        const lm = this.worldData.landmarks.find((l) => l.name.toLowerCase().includes(nameQuery.toLowerCase()));
        if (!lm)
            return;
        const ground = this.physicsWorld.sampleGround(lm.worldPosition.x, lm.worldPosition.z);
        const targetPos = { x: lm.worldPosition.x, y: ground.height + 1.0, z: lm.worldPosition.z };
        if (this.playerCharacter.state === 'IN_VEHICLE') {
            this.playerVehicle.setPosition(targetPos);
        }
        else {
            this.playerCharacter.position.set(targetPos.x, targetPos.y, targetPos.z);
            this.playerCharacter.previousPosition.copy(this.playerCharacter.position);
            this.playerCharacter.velocity.set(0, 0, 0);
        }
        console.log(`[EngineCoordinator] Teleported player to ${lm.name} at (${targetPos.x.toFixed(1)}, ${targetPos.y.toFixed(1)}, ${targetPos.z.toFixed(1)})`);
    }
    registerEventListeners() {
        window.addEventListener('keydown', this.keydownListener);
        window.addEventListener('keyup', this.keyupListener);
        window.addEventListener('mousemove', this.mousemoveListener);
        window.addEventListener('mousedown', this.mousedownListener);
        window.addEventListener('resize', this.resizeListener);
        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement !== null;
        });
    }
    /**
     * Hot-reload teardown hook: clean termination without memory leaks.
     */
    destroy() {
        console.log('[EngineCoordinator] Destroying engine session and releasing resources...');
        this.loop.destroy();
        window.removeEventListener('keydown', this.keydownListener);
        window.removeEventListener('keyup', this.keyupListener);
        window.removeEventListener('mousemove', this.mousemoveListener);
        window.removeEventListener('mousedown', this.mousedownListener);
        window.removeEventListener('resize', this.resizeListener);
        this.terrainGenerator.destroy();
        this.trafficDirector.destroy();
        this.playerVehicleEntity.destroy();
        this.hud.destroy();
        this.renderer.dispose();
        if (this.renderer.domElement.parentElement) {
            this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        }
    }
}
