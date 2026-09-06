/**
 * Cinematic Open-World Game HUD & Real-Time Minimap.
 * Renders GPS minimap with landmark beacons (Canary Hill, Gandhi Maidan, Hazaribagh Lake, NH 33),
 * analog/digital speedometer, KalaChakra 60Hz physics tick counter, and active locomotion state.
 */
import { CoordinateProjection } from '../gis/CoordinateProjection';
export class GameHUD {
    container;
    minimapCanvas;
    minimapCtx;
    telemetryEl;
    speedometerEl;
    speedNumberEl;
    speedUnitEl;
    rpmBarEl;
    stateBadgeEl;
    landmarkBadgeEl;
    roadGraph = null;
    landmarks = [];
    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'game-hud-container';
        this.container.style.position = 'fixed';
        this.container.style.inset = '0';
        this.container.style.pointerEvents = 'none';
        this.container.style.fontFamily = "'Rajdhani', 'Segoe UI', system-ui, sans-serif";
        this.container.style.userSelect = 'none';
        this.container.style.zIndex = '100';
        // 1. Top-Left Telemetry & GPS Coordinates
        this.telemetryEl = document.createElement('div');
        this.telemetryEl.style.position = 'absolute';
        this.telemetryEl.style.top = '18px';
        this.telemetryEl.style.left = '18px';
        this.telemetryEl.style.background = 'rgba(10, 15, 25, 0.82)';
        this.telemetryEl.style.backdropFilter = 'blur(8px)';
        this.telemetryEl.style.border = '1px solid rgba(0, 245, 212, 0.3)';
        this.telemetryEl.style.borderRadius = '6px';
        this.telemetryEl.style.padding = '12px 16px';
        this.telemetryEl.style.color = '#e0e6ed';
        this.telemetryEl.style.fontSize = '13px';
        this.telemetryEl.style.letterSpacing = '0.5px';
        this.telemetryEl.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4)';
        this.container.appendChild(this.telemetryEl);
        // 2. Top-Right Controls Helper
        const controlsEl = document.createElement('div');
        controlsEl.style.position = 'absolute';
        controlsEl.style.top = '18px';
        controlsEl.style.right = '18px';
        controlsEl.style.background = 'rgba(10, 15, 25, 0.82)';
        controlsEl.style.backdropFilter = 'blur(8px)';
        controlsEl.style.border = '1px solid rgba(255, 183, 3, 0.3)';
        controlsEl.style.borderRadius = '6px';
        controlsEl.style.padding = '12px 16px';
        controlsEl.style.color = '#f1faee';
        controlsEl.style.fontSize = '12px';
        controlsEl.style.lineHeight = '1.6';
        controlsEl.innerHTML = `
      <div style="color: #ffb703; font-weight: 700; margin-bottom: 4px; font-size: 13px;">HAZARIBAGH PROTOCOL CONTROLS</div>
      <div><span style="color:#00f5d4; font-weight:bold;">WASD</span> : Move / Steer & Accelerate</div>
      <div><span style="color:#00f5d4; font-weight:bold;">SHIFT</span> : Sprint (Foot) / Boost</div>
      <div><span style="color:#00f5d4; font-weight:bold;">SPACE</span> : Jump / Handbrake Drift</div>
      <div><span style="color:#00f5d4; font-weight:bold;">F</span> : Enter / Exit Vehicle</div>
      <div><span style="color:#00f5d4; font-weight:bold;">MOUSE</span> : Look Orbit</div>
      <div><span style="color:#00f5d4; font-weight:bold;">C</span> : Teleport to Canary Hill Peak</div>
      <div><span style="color:#00f5d4; font-weight:bold;">G</span> : Teleport to Gandhi Maidan</div>
      <div><span style="color:#00f5d4; font-weight:bold;">L</span> : Teleport to Hazaribagh Lake</div>
    `;
        this.container.appendChild(controlsEl);
        // 3. Bottom-Left Minimap
        const minimapWrapper = document.createElement('div');
        minimapWrapper.style.position = 'absolute';
        minimapWrapper.style.bottom = '22px';
        minimapWrapper.style.left = '22px';
        minimapWrapper.style.width = '210px';
        minimapWrapper.style.height = '210px';
        minimapWrapper.style.borderRadius = '50%';
        minimapWrapper.style.overflow = 'hidden';
        minimapWrapper.style.border = '3px solid rgba(0, 245, 212, 0.65)';
        minimapWrapper.style.boxShadow = '0 0 20px rgba(0, 245, 212, 0.25), inset 0 0 15px rgba(0,0,0,0.8)';
        minimapWrapper.style.background = '#0d131a';
        this.minimapCanvas = document.createElement('canvas');
        this.minimapCanvas.width = 210;
        this.minimapCanvas.height = 210;
        this.minimapCanvas.style.width = '100%';
        this.minimapCanvas.style.height = '100%';
        this.minimapCtx = this.minimapCanvas.getContext('2d');
        minimapWrapper.appendChild(this.minimapCanvas);
        this.container.appendChild(minimapWrapper);
        // 4. Bottom-Right Speedometer (GTA Style)
        this.speedometerEl = document.createElement('div');
        this.speedometerEl.style.position = 'absolute';
        this.speedometerEl.style.bottom = '22px';
        this.speedometerEl.style.right = '22px';
        this.speedometerEl.style.background = 'rgba(10, 15, 25, 0.85)';
        this.speedometerEl.style.border = '1px solid rgba(255, 255, 255, 0.15)';
        this.speedometerEl.style.borderRadius = '10px';
        this.speedometerEl.style.padding = '14px 20px';
        this.speedometerEl.style.textAlign = 'right';
        this.speedometerEl.style.width = '140px';
        const speedRow = document.createElement('div');
        this.speedNumberEl = document.createElement('span');
        this.speedNumberEl.style.fontSize = '38px';
        this.speedNumberEl.style.fontWeight = '800';
        this.speedNumberEl.style.color = '#ffffff';
        this.speedNumberEl.innerText = '0';
        this.speedUnitEl = document.createElement('span');
        this.speedUnitEl.style.fontSize = '14px';
        this.speedUnitEl.style.marginLeft = '6px';
        this.speedUnitEl.style.color = '#00f5d4';
        this.speedUnitEl.innerText = 'KM/H';
        speedRow.appendChild(this.speedNumberEl);
        speedRow.appendChild(this.speedUnitEl);
        this.speedometerEl.appendChild(speedRow);
        // Tachometer / RPM indicator bar
        const rpmTrack = document.createElement('div');
        rpmTrack.style.width = '100%';
        rpmTrack.style.height = '5px';
        rpmTrack.style.background = '#222d3d';
        rpmTrack.style.borderRadius = '3px';
        rpmTrack.style.marginTop = '6px';
        rpmTrack.style.overflow = 'hidden';
        this.rpmBarEl = document.createElement('div');
        this.rpmBarEl.style.width = '0%';
        this.rpmBarEl.style.height = '100%';
        this.rpmBarEl.style.background = 'linear-gradient(90deg, #00f5d4, #ffb703, #e63946)';
        this.rpmBarEl.style.transition = 'width 0.05s ease';
        rpmTrack.appendChild(this.rpmBarEl);
        this.speedometerEl.appendChild(rpmTrack);
        // State badge
        const badgeRow = document.createElement('div');
        badgeRow.style.marginTop = '8px';
        badgeRow.style.fontSize = '11px';
        badgeRow.style.display = 'flex';
        badgeRow.style.justifyContent = 'space-between';
        this.stateBadgeEl = document.createElement('span');
        this.stateBadgeEl.style.color = '#ffb703';
        this.stateBadgeEl.style.fontWeight = 'bold';
        this.stateBadgeEl.innerText = 'ON FOOT [IDLE]';
        this.landmarkBadgeEl = document.createElement('span');
        this.landmarkBadgeEl.style.color = '#8d99ae';
        this.landmarkBadgeEl.innerText = 'Gandhi Maidan';
        badgeRow.appendChild(this.stateBadgeEl);
        this.speedometerEl.appendChild(badgeRow);
        this.container.appendChild(this.speedometerEl);
        document.body.appendChild(this.container);
    }
    setNavigationData(roadGraph, landmarks) {
        this.roadGraph = roadGraph;
        this.landmarks = landmarks;
    }
    /**
     * Updates HUD telemetry and renders GPS radar minimap.
     */
    update(telemetry, playerHeadingYaw) {
        const gps = CoordinateProjection.worldToGps(telemetry.playerPosition);
        this.telemetryEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap: 16px; margin-bottom: 4px;">
        <span style="font-weight:700; color:#00f5d4;">KALACHAKRA 60Hz DUAL LOOP</span>
        <span style="color:#52b788; font-weight:700;">PHY: ${telemetry.physicsTickRateHz} Hz | FPS: ${telemetry.fps}</span>
      </div>
      <div style="font-size:12px; color:#a8dadc; margin-bottom: 4px;">
        HAZARIBAGH, JHARKHAND (WGS-84): ${gps.lat.toFixed(5)}° N, ${gps.lon.toFixed(5)}° E
      </div>
      <div style="font-size:12px; color:#adb5bd;">
        ELEVATION: ${gps.elevation.toFixed(1)}m MSL | OCTREE CHUNKS: ${telemetry.visibleChunksCount} / ${telemetry.octreeTotalNodes}
      </div>
      <div style="font-size:12px; color:#ffb703; margin-top: 3px;">
        PROXIMITY: ${telemetry.nearestLandmarkName} (${Math.round(telemetry.nearestLandmarkDistance)}m)
      </div>
    `;
        this.speedNumberEl.innerText = `${telemetry.playerSpeedKmh}`;
        const rpmPercent = Math.min(100, Math.round((telemetry.playerSpeedKmh / 160) * 100));
        this.rpmBarEl.style.width = `${rpmPercent}%`;
        this.stateBadgeEl.innerText = telemetry.currentVehicleId ? 'IN VEHICLE [DRIVE]' : `ON FOOT [${telemetry.playerState}]`;
        // Render Minimap
        this.renderMinimap(telemetry.playerPosition, playerHeadingYaw);
    }
    renderMinimap(playerPos, playerHeadingYaw) {
        const ctx = this.minimapCtx;
        const w = this.minimapCanvas.width;
        const h = this.minimapCanvas.height;
        const cx = w * 0.5;
        const cy = h * 0.5;
        const radarScale = 0.22; // Pixels per meter
        // Clear background
        ctx.fillStyle = '#0f1724';
        ctx.fillRect(0, 0, w, h);
        // Radar concentric circles
        ctx.strokeStyle = 'rgba(0, 245, 212, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 30, 0, Math.PI * 2);
        ctx.arc(cx, cy, 65, 0, Math.PI * 2);
        ctx.arc(cx, cy, 95, 0, Math.PI * 2);
        ctx.stroke();
        // Crosshairs
        ctx.strokeStyle = 'rgba(0, 245, 212, 0.1)';
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, h);
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.stroke();
        // Draw road edges
        if (this.roadGraph) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
            ctx.lineWidth = 2.5;
            const edges = this.roadGraph.getAllEdges();
            for (let i = 0; i < edges.length; i += 2) {
                const edge = edges[i];
                if (edge.geometry.length < 2)
                    continue;
                const p1 = edge.geometry[0];
                const p2 = edge.geometry[1];
                // Check if edge is within radar range (~450m)
                const d = Math.hypot(p1.x - playerPos.x, p1.z - playerPos.z);
                if (d > 450)
                    continue;
                const rx1 = cx + (p1.x - playerPos.x) * radarScale;
                const ry1 = cy + (p1.z - playerPos.z) * radarScale;
                const rx2 = cx + (p2.x - playerPos.x) * radarScale;
                const ry2 = cy + (p2.z - playerPos.z) * radarScale;
                ctx.beginPath();
                ctx.moveTo(rx1, ry1);
                ctx.lineTo(rx2, ry2);
                ctx.stroke();
            }
        }
        // Draw cultural landmark beacons
        for (const lm of this.landmarks) {
            const dx = lm.worldPosition.x - playerPos.x;
            const dz = lm.worldPosition.z - playerPos.z;
            const dist = Math.hypot(dx, dz);
            let lx = cx + dx * radarScale;
            let ly = cy + dz * radarScale;
            // Clamp to radar circumference if outside
            const maxRad = 92;
            if (Math.hypot(lx - cx, ly - cy) > maxRad) {
                const angle = Math.atan2(ly - cy, lx - cx);
                lx = cx + Math.cos(angle) * maxRad;
                ly = cy + Math.sin(angle) * maxRad;
            }
            ctx.fillStyle = lm.name.includes('Canary') ? '#00f5d4' : lm.name.includes('Lake') ? '#00b4d8' : '#ffb703';
            ctx.beginPath();
            ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
            ctx.fill();
            // Highlight text for Canary Hill and Lake
            if (dist < 400 || lm.name.includes('Canary') || lm.name.includes('Lake')) {
                ctx.fillStyle = '#f1faee';
                ctx.font = '9px sans-serif';
                ctx.fillText(lm.name.substring(0, 12), lx + 6, ly + 3);
            }
        }
        // Draw Player Blip & Direction Arrow
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(playerHeadingYaw);
        ctx.fillStyle = '#ff0055';
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(6, 6);
        ctx.lineTo(0, 3);
        ctx.lineTo(-6, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    destroy() {
        if (this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }
}
