/**
 * Application Entrypoint: Hazaribagh 3D Open-World Engine.
 * Boots the EngineCoordinator and configures Hot Module Replacement (HMR) teardown hooks.
 */
import { EngineCoordinator } from './core/EngineCoordinator';
const engine = new EngineCoordinator();
// Initialize the real-world open world
engine.initialize().catch((err) => {
    console.error('[Main] Failed to boot Hazaribagh engine:', err);
});
// Vite Hot Module Replacement (HMR) clean-up hook
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        console.log('[Main HMR] Teardown triggered by hot reload.');
        engine.destroy();
    });
}
