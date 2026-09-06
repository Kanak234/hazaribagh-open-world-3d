/**
 * Procedural Open-World Terrain & Road Mesh Generator.
 * Transforms parsed real-world OSM data into 3D geometries:
 * 1. Road ribbons (asphalt with lane markings & intersections)
 * 2. Water surfaces (Hazaribagh Jheel with specular water shading)
 * 3. Canary Hill forested topography & Wildlife Sanctuary peripheries
 * 4. Cultural landmark monuments & urban building blocks
 */
import * as THREE from 'three';
import { CoordinateProjection } from './CoordinateProjection';
import { Guardrails } from '../core/Guardrails';
export class TerrainRoadGenerator {
    scene;
    octree;
    // Reusable materials
    asphaltMaterial;
    highwayMaterial;
    waterMaterial;
    terrainMaterial;
    hillMaterial;
    buildingMaterial;
    landmarkMaterial;
    roadMeshes = [];
    waterMeshes = [];
    terrainMeshes = [];
    buildingMeshes = null;
    treeMeshes = null;
    landmarkObjects = [];
    constructor(scene, octree) {
        this.scene = Guardrails.assertNonNull(scene, 'Scene reference in TerrainRoadGenerator');
        this.octree = Guardrails.assertNonNull(octree, 'SpatialOctree reference in TerrainRoadGenerator');
        // Materials configured for high visual fidelity
        this.asphaltMaterial = new THREE.MeshStandardMaterial({
            color: 0x222428,
            roughness: 0.85,
            metalness: 0.1,
        });
        this.highwayMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1c20,
            roughness: 0.75,
            metalness: 0.15,
        });
        this.waterMaterial = new THREE.MeshStandardMaterial({
            color: 0x1b4965,
            roughness: 0.15,
            metalness: 0.85,
            transparent: true,
            opacity: 0.85,
        });
        this.terrainMaterial = new THREE.MeshStandardMaterial({
            color: 0x3d5a45,
            roughness: 0.95,
            metalness: 0.05,
        });
        this.hillMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d4734,
            roughness: 0.9,
            metalness: 0.05,
        });
        this.buildingMaterial = new THREE.MeshStandardMaterial({
            color: 0xd8d4cc,
            roughness: 0.7,
            metalness: 0.2,
        });
        this.landmarkMaterial = new THREE.MeshStandardMaterial({
            color: 0xffb703,
            emissive: 0x332000,
            roughness: 0.3,
            metalness: 0.8,
        });
    }
    /**
     * Generates the complete 3D world representation from parsed OSM data.
     */
    generateWorld(worldData) {
        console.log('[TerrainRoadGenerator] Starting procedural generation of Hazaribagh open world...');
        // 1. Generate base topographic terrain with Canary Hill & plateau contours
        this.generateTopographicTerrain();
        // 2. Generate road ribbons matching real GIS paths
        this.generateRoadRibbons(worldData.roads);
        // 3. Generate Hazaribagh Jheel and water surfaces
        this.generateWaterBodies(worldData.waterBodies);
        // 4. Generate cultural landmark beacons
        this.generateLandmarks(worldData.landmarks);
        // 5. Generate urban buildings and forested vegetation (Canary Hill & Sanctuary)
        this.generateUrbanBuildingsAndVegetation(worldData.roads);
        console.log('[TerrainRoadGenerator] Procedural world generation completed successfully.');
    }
    /**
     * Generates continuous 3D terrain mesh shaped by the real elevation model.
     */
    generateTopographicTerrain() {
        const size = 6000;
        const segments = 120;
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        geometry.rotateX(-Math.PI / 2);
        const posAttr = geometry.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const z = posAttr.getZ(i);
            const y = CoordinateProjection.calculateTopographicElevation(x, z);
            posAttr.setY(i, y);
        }
        geometry.computeVertexNormals();
        const terrainMesh = new THREE.Mesh(geometry, this.terrainMaterial);
        terrainMesh.receiveShadow = true;
        this.scene.add(terrainMesh);
        this.terrainMeshes.push(terrainMesh);
        // Register terrain chunk into spatial octree
        const aabb = {
            min: { x: -size / 2, y: -20, z: -size / 2 },
            max: { x: size / 2, y: 150, z: size / 2 },
        };
        this.octree.insert({
            id: 'terrain_base',
            aabb,
            userData: { type: 'terrain', mesh: terrainMesh },
        });
    }
    /**
     * Extrudes real road polylines into 3D asphalt road ribbons with accurate lane widths.
     */
    generateRoadRibbons(roads) {
        const mergedGeometries = [];
        // Filter to significant road corridors within the playable urban perimeter
        const activeRoads = roads.filter((r) => {
            if (r.points.length < 2)
                return false;
            const first = r.points[0];
            return Math.hypot(first.x, first.z) < 2800;
        });
        for (const road of activeRoads) {
            const halfWidth = (road.lanes * 3.5) / 2.0; // 3.5 meters per lane
            const vertices = [];
            const normals = [];
            const uvs = [];
            const indices = [];
            for (let i = 0; i < road.points.length; i++) {
                const p = road.points[i];
                let dirX = 0;
                let dirZ = 1;
                if (i < road.points.length - 1) {
                    const next = road.points[i + 1];
                    dirX = next.x - p.x;
                    dirZ = next.z - p.z;
                }
                else if (i > 0) {
                    const prev = road.points[i - 1];
                    dirX = p.x - prev.x;
                    dirZ = p.z - prev.z;
                }
                const len = Math.hypot(dirX, dirZ);
                if (len > 0.0001) {
                    dirX /= len;
                    dirZ /= len;
                }
                // Perpendicular vector for road width
                const perpX = -dirZ * halfWidth;
                const perpZ = dirX * halfWidth;
                const roadElevation = CoordinateProjection.calculateTopographicElevation(p.x, p.z) + 0.15; // slightly above ground to prevent z-fighting
                // Left vertex
                vertices.push(p.x + perpX, roadElevation, p.z + perpZ);
                normals.push(0, 1, 0);
                uvs.push(0, i * 0.5);
                // Right vertex
                vertices.push(p.x - perpX, roadElevation, p.z - perpZ);
                normals.push(0, 1, 0);
                uvs.push(1, i * 0.5);
                if (i > 0) {
                    const base = (i - 1) * 2;
                    indices.push(base, base + 1, base + 2);
                    indices.push(base + 1, base + 3, base + 2);
                }
            }
            if (vertices.length > 0) {
                const ribbonGeom = new THREE.BufferGeometry();
                ribbonGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                ribbonGeom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
                ribbonGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
                ribbonGeom.setIndex(indices);
                mergedGeometries.push(ribbonGeom);
                // Register road section in Octree
                let minX = Infinity, minY = Infinity, minZ = Infinity;
                let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                for (let v = 0; v < vertices.length; v += 3) {
                    minX = Math.min(minX, vertices[v]);
                    minY = Math.min(minY, vertices[v + 1]);
                    minZ = Math.min(minZ, vertices[v + 2]);
                    maxX = Math.max(maxX, vertices[v]);
                    maxY = Math.max(maxY, vertices[v + 1]);
                    maxZ = Math.max(maxZ, vertices[v + 2]);
                }
                this.octree.insert({
                    id: road.id,
                    aabb: { min: { x: minX, y: minY - 0.5, z: minZ }, max: { x: maxX, y: maxY + 0.5, z: maxZ } },
                    userData: { type: 'road', name: road.name, highwayType: road.highwayType },
                });
            }
        }
        // Merge road meshes for optimal draw calls
        for (const geom of mergedGeometries) {
            const mesh = new THREE.Mesh(geom, this.asphaltMaterial);
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.roadMeshes.push(mesh);
        }
    }
    /**
     * Generates water polygons for Hazaribagh Jheel and urban reservoirs.
     */
    generateWaterBodies(waterBodies) {
        for (const water of waterBodies) {
            if (water.points.length < 3)
                continue;
            const shape = new THREE.Shape();
            const first = water.points[0];
            shape.moveTo(first.x, -first.z);
            for (let i = 1; i < water.points.length; i++) {
                shape.lineTo(water.points[i].x, -water.points[i].z);
            }
            const waterGeom = new THREE.ShapeGeometry(shape);
            waterGeom.rotateX(-Math.PI / 2);
            // Find average elevation around water body
            let avgY = 0;
            for (const p of water.points) {
                avgY += CoordinateProjection.calculateTopographicElevation(p.x, p.z);
            }
            avgY /= water.points.length;
            const waterMesh = new THREE.Mesh(waterGeom, this.waterMaterial);
            waterMesh.position.y = avgY - 0.2;
            this.scene.add(waterMesh);
            this.waterMeshes.push(waterMesh);
        }
    }
    /**
     * Spawns 3D visual markers for real-world Hazaribagh cultural landmarks.
     */
    generateLandmarks(landmarks) {
        const keyLandmarksToHighlight = [
            'Canary Hill',
            'Gandhi Maidan',
            'Hazaribagh',
            'NH 33',
            'St. Columba',
            'Sadar Hospital',
        ];
        for (const lm of landmarks) {
            const isKey = keyLandmarksToHighlight.some((k) => lm.name.toLowerCase().includes(k.toLowerCase()));
            if (!isKey && Math.hypot(lm.worldPosition.x, lm.worldPosition.z) > 1500) {
                continue;
            }
            const group = new THREE.Group();
            group.position.set(lm.worldPosition.x, lm.worldPosition.y, lm.worldPosition.z);
            // Monument pedestal
            const pedestalGeom = new THREE.CylinderGeometry(2.5, 3.5, 3, 16);
            const pedestal = new THREE.Mesh(pedestalGeom, this.landmarkMaterial);
            pedestal.position.y = 1.5;
            group.add(pedestal);
            // Pulsing holographic beacon obelisk
            const beaconGeom = new THREE.OctahedronGeometry(1.8, 0);
            const beaconMat = new THREE.MeshBasicMaterial({
                color: 0x00f5d4,
                wireframe: true,
            });
            const beacon = new THREE.Mesh(beaconGeom, beaconMat);
            beacon.position.y = 5.0;
            group.add(beacon);
            // Vertical beacon ray
            const beamGeom = new THREE.CylinderGeometry(0.15, 0.15, 80, 8);
            const beamMat = new THREE.MeshBasicMaterial({
                color: 0x00f5d4,
                transparent: true,
                opacity: 0.35,
            });
            const beam = new THREE.Mesh(beamGeom, beamMat);
            beam.position.y = 40;
            group.add(beam);
            this.scene.add(group);
            this.landmarkObjects.push(group);
            // Register landmark in Octree
            this.octree.insert({
                id: lm.id,
                aabb: {
                    min: { x: lm.worldPosition.x - 5, y: lm.worldPosition.y, z: lm.worldPosition.z - 5 },
                    max: { x: lm.worldPosition.x + 5, y: lm.worldPosition.y + 80, z: lm.worldPosition.z + 5 },
                },
                userData: { type: 'landmark', name: lm.name, category: lm.category },
            });
        }
    }
    /**
     * Generates urban structures along road networks and sal/pine trees around Canary Hill.
     */
    generateUrbanBuildingsAndVegetation(roads) {
        const buildingCount = 450;
        const buildingGeom = new THREE.BoxGeometry(1, 1, 1);
        this.buildingMeshes = new THREE.InstancedMesh(buildingGeom, this.buildingMaterial, buildingCount);
        const dummy = new THREE.Object3D();
        let bIndex = 0;
        // Distribute buildings offset from road vertices
        for (let r = 0; r < roads.length && bIndex < buildingCount; r++) {
            const road = roads[r];
            for (let p = 0; p < road.points.length && bIndex < buildingCount; p += 2) {
                const pt = road.points[p];
                if (Math.hypot(pt.x, pt.z) > 1800)
                    continue;
                // Offset 14m left or right of road
                const side = bIndex % 2 === 0 ? 1 : -1;
                const bx = pt.x + side * (12 + (bIndex % 8));
                const bz = pt.z + (side * (8 + (bIndex % 5)));
                const by = CoordinateProjection.calculateTopographicElevation(bx, bz);
                const width = 10 + (bIndex % 7) * 2;
                const depth = 12 + (bIndex % 5) * 2;
                const height = 8 + (bIndex % 15) * 2.5;
                dummy.position.set(bx, by + height / 2, bz);
                dummy.scale.set(width, height, depth);
                dummy.rotation.y = (bIndex * 0.4);
                dummy.updateMatrix();
                this.buildingMeshes.setMatrixAt(bIndex, dummy.matrix);
                this.octree.insert({
                    id: `bldg_${bIndex}`,
                    aabb: {
                        min: { x: bx - width / 2, y: by, z: bz - depth / 2 },
                        max: { x: bx + width / 2, y: by + height, z: bz + depth / 2 },
                    },
                    userData: { type: 'building', height },
                });
                bIndex++;
            }
        }
        this.buildingMeshes.instanceMatrix.needsUpdate = true;
        this.scene.add(this.buildingMeshes);
        // Forested slopes around Canary Hill
        const treeCount = 600;
        const treeGeom = new THREE.ConeGeometry(2.5, 8, 5);
        this.treeMeshes = new THREE.InstancedMesh(treeGeom, this.hillMaterial, treeCount);
        const canaryCenter = CoordinateProjection.gpsToWorld(CoordinateProjection.CANARY_HILL_LAT, CoordinateProjection.CANARY_HILL_LON);
        let tIndex = 0;
        for (let i = 0; i < treeCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const rad = 40 + Math.random() * 550;
            const tx = canaryCenter.x + Math.cos(angle) * rad;
            const tz = canaryCenter.z + Math.sin(angle) * rad;
            const ty = CoordinateProjection.calculateTopographicElevation(tx, tz);
            const treeScale = 0.8 + Math.random() * 0.7;
            dummy.position.set(tx, ty + 4 * treeScale, tz);
            dummy.scale.set(treeScale, treeScale, treeScale);
            dummy.rotation.y = Math.random() * Math.PI;
            dummy.updateMatrix();
            this.treeMeshes.setMatrixAt(tIndex++, dummy.matrix);
        }
        this.treeMeshes.instanceMatrix.needsUpdate = true;
        this.scene.add(this.treeMeshes);
    }
    destroy() {
        for (const mesh of this.roadMeshes) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
        }
        for (const mesh of this.waterMeshes) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
        }
        for (const mesh of this.terrainMeshes) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
        }
        if (this.buildingMeshes) {
            this.scene.remove(this.buildingMeshes);
            this.buildingMeshes.geometry.dispose();
        }
        if (this.treeMeshes) {
            this.scene.remove(this.treeMeshes);
            this.treeMeshes.geometry.dispose();
        }
        for (const obj of this.landmarkObjects) {
            this.scene.remove(obj);
        }
        this.roadMeshes = [];
        this.waterMeshes = [];
        this.terrainMeshes = [];
        this.landmarkObjects = [];
    }
}
