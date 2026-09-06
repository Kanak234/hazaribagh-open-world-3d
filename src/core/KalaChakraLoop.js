/**
 * KalaChakra Dual Loop Architecture.
 * Strictly separates the fixed 60Hz physics simulation (_physics_process) from the
 * variable high-refresh rendering loop (_process with sub-frame alpha interpolation).
 *
 * Guarantees:
 * 1. Zero physics tunneling regardless of monitor refresh rate (60Hz, 144Hz, 240Hz).
 * 2. Spiral-of-death prevention via accumulator clamping.
 * 3. Hot-reloadable lifecycle hooks with clean cancellation.
 */
import { Guardrails } from './Guardrails';
export class KalaChakraLoop {
    isRunning = false;
    animationFrameId = null;
    lastTimestamp = 0;
    accumulator = 0;
    // Fixed 60Hz physics step: exactly 1/60th second
    fixedDeltaTime = 1.0 / 60.0;
    // Prevent spiral of death if a frame takes too long (max 10 sub-steps = ~0.166s)
    maxAccumulatedTime = 0.1666;
    onPhysicsProcess;
    onRenderProcess;
    // Telemetry counters
    frameCount = 0;
    physicsTickCount = 0;
    telemetryTimer = 0;
    currentFps = 60;
    currentPhysicsHz = 60;
    constructor(physicsCallback, renderCallback) {
        this.onPhysicsProcess = Guardrails.assertNonNull(physicsCallback, 'KalaChakraLoop physics callback');
        this.onRenderProcess = Guardrails.assertNonNull(renderCallback, 'KalaChakraLoop render callback');
    }
    /**
     * Starts the decoupled dual loop.
     */
    start() {
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        this.lastTimestamp = performance.now();
        this.accumulator = 0;
        this.frameCount = 0;
        this.physicsTickCount = 0;
        this.telemetryTimer = performance.now();
        const loop = (currentTimestamp) => {
            if (!this.isRunning) {
                return;
            }
            // Compute frame delta in seconds
            const rawDelta = (currentTimestamp - this.lastTimestamp) / 1000.0;
            this.lastTimestamp = currentTimestamp;
            // Sanitize frame delta to prevent negative jumps or huge spikes from tab switching
            const frameDelta = Guardrails.sanitizeNumber(rawDelta, 0.0001, 0.25, this.fixedDeltaTime);
            this.accumulator += frameDelta;
            // Clamp accumulator to protect against spiral of death
            if (this.accumulator > this.maxAccumulatedTime) {
                this.accumulator = this.maxAccumulatedTime;
            }
            // Execute fixed 60Hz physics steps
            while (this.accumulator >= this.fixedDeltaTime) {
                Guardrails.safeExecute(() => this.onPhysicsProcess(this.fixedDeltaTime), undefined, 'KalaChakraLoop._physics_process');
                this.accumulator -= this.fixedDeltaTime;
                this.physicsTickCount++;
            }
            // Calculate sub-frame alpha interpolation factor [0.0, 1.0)
            const alpha = Math.min(Math.max(this.accumulator / this.fixedDeltaTime, 0.0), 1.0);
            // Execute variable high-refresh render loop with alpha interpolation
            Guardrails.safeExecute(() => this.onRenderProcess(frameDelta, alpha), undefined, 'KalaChakraLoop._process');
            this.frameCount++;
            // Telemetry update every 1000ms
            const now = performance.now();
            if (now - this.telemetryTimer >= 1000.0) {
                const elapsed = (now - this.telemetryTimer) / 1000.0;
                this.currentFps = Math.round(this.frameCount / elapsed);
                this.currentPhysicsHz = Math.round(this.physicsTickCount / elapsed);
                this.frameCount = 0;
                this.physicsTickCount = 0;
                this.telemetryTimer = now;
            }
            this.animationFrameId = requestAnimationFrame(loop);
        };
        this.animationFrameId = requestAnimationFrame(loop);
    }
    /**
     * Halts the loop and frees animation frame handlers.
     */
    stop() {
        this.isRunning = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    /**
     * Hot-reload teardown hook.
     */
    destroy() {
        this.stop();
        this.accumulator = 0;
    }
    getTelemetry() {
        return {
            fps: this.currentFps,
            physicsHz: this.currentPhysicsHz,
        };
    }
    getFixedDeltaTime() {
        return this.fixedDeltaTime;
    }
}
