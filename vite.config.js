import { defineConfig } from 'vite';
import path from 'path';
export default defineConfig({
    root: '.',
    publicDir: 'public',
    server: {
        port: 5173,
        host: true,
        open: false
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
        target: 'esnext'
    }
});
