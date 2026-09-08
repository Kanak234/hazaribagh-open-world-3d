import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // src/ carries 19 compiled .js files sitting next to their .ts sources,
    // 18 of them committed. Vite's default extension order resolves an
    // extensionless import to the .js first, so tests would silently exercise
    // stale build output instead of the TypeScript they are written against.
    // Verified: with the default order, breaking RoadGraph.ts -- even adding a
    // throw to its constructor -- left all tests green.
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
  },
});
