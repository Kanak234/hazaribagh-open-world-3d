/**
 * Core Data Structures and Interfaces for the Hazaribagh 3D Open-World Engine.
 * Covers spatial math, handling.cfg physics, character locomotion state machine,
 * real GIS topology, and decoupled engine loop state.
 */

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Transform3D {
  position: Vector3D;
  rotation: Vector3D; // Euler angles in radians [yaw, pitch, roll]
  scale: Vector3D;
}

export interface AABB3D {
  min: Vector3D;
  max: Vector3D;
}

export interface Ray3D {
  origin: Vector3D;
  direction: Vector3D;
  length: number;
}

export interface RaycastHit {
  hit: boolean;
  distance: number;
  point: Vector3D;
  normal: Vector3D;
  colliderId: string | null;
}

export interface SweptHit {
  hit: boolean;
  time: number; // Time of impact in [0, 1]
  normal: Vector3D;
  point: Vector3D;
  colliderId: string | null;
}

/**
 * Arcade-Simulation Vehicle Handling Configuration (Inspired by GTA handling.cfg)
 */
export interface HandlingConfig {
  id: string;
  name: string;
  mass: number; // Vehicle mass in kg (e.g. 1500)
  dimensions: Vector3D; // Length, Height, Width bounding dimensions
  driveType: 'RWD' | 'FWD' | 'AWD';
  engineForce: number; // Maximum drive force in Newtons
  brakingDeceleration: number; // Brake force
  reverseForce: number; // Reverse drive force
  maxSteerAngle: number; // In radians (e.g. 0.6 rad ~ 35 deg)
  steerSpeed: number; // Steering turn-rate per second
  suspensionRestLength: number; // Equilibrium spring rest length in meters
  suspensionStiffness: number; // Spring stiffness constant (k)
  suspensionDamping: number; // Shock absorber damping constant (c)
  suspensionTravel: number; // Maximum travel distance
  wheelRadius: number; // Radius of tires in meters
  tireGripForward: number; // Longitudinal friction coefficient
  tireGripSide: number; // Lateral cornering friction coefficient
  driftFactor: number; // Friction reduction under handbrake drift (0.2 - 0.4)
  centerOfMassOffset: Vector3D; // Vertical/Longitudinal COM shift to stabilize rolls
  rollInfluence: number; // Anti-roll bar torque factor (0.0 = none, 1.0 = rigid)
  dragCoefficient: number; // Aerodynamic drag
  topSpeed: number; // Maximum speed in m/s (e.g. 50 m/s = 180 km/h)
}

export type CharacterStateType =
  | 'IDLE'
  | 'JOG'
  | 'SPRINT'
  | 'VAULT'
  | 'ENTER_VEHICLE'
  | 'IN_VEHICLE'
  | 'EXIT_VEHICLE';

export interface PlayerInputState {
  moveForward: number; // -1 (backward) to +1 (forward)
  moveRight: number; // -1 (left) to +1 (right)
  sprint: boolean;
  jump: boolean;
  enterExitVehicle: boolean;
  handbrake: boolean;
  mouseDeltaX: number;
  mouseDeltaY: number;
}

export interface OsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface OsmWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

export type OsmElement = OsmNode | OsmWay;

export interface OsmDataset {
  elements: OsmElement[];
}

export interface LandmarkData {
  id: string;
  name: string;
  category: string;
  worldPosition: Vector3D;
  originalLat: number;
  originalLon: number;
  elevation: number;
}

export interface RoadNode {
  id: number;
  position: Vector3D;
  edges: string[]; // Connected road edge IDs
}

export interface RoadEdge {
  id: string;
  fromNodeId: number;
  toNodeId: number;
  length: number;
  lanes: number;
  speedLimitKmh: number;
  highwayType: string;
  name: string;
  geometry: Vector3D[]; // Interpolated spline/polyline nodes
}

export interface PathfindingResult {
  found: boolean;
  nodeIds: number[];
  totalDistance: number;
  waypoints: Vector3D[];
}

export interface SpatialOctreeItem {
  id: string;
  aabb: AABB3D;
  userData: unknown;
}

export interface EngineTelemetry {
  fps: number;
  physicsTickRateHz: number;
  activeEntitiesCount: number;
  octreeTotalNodes: number;
  visibleChunksCount: number;
  playerState: CharacterStateType;
  playerPosition: Vector3D;
  playerSpeedKmh: number;
  currentVehicleId: string | null;
  nearestLandmarkName: string;
  nearestLandmarkDistance: number;
  originGps: { lat: number; lon: number };
}
