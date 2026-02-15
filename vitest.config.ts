import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const MIN_THRESHOLD = 85;

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/{types,defaults,constants}.ts', 'src/**/*.test.ts'],
      thresholds: {
        lines: MIN_THRESHOLD,
        functions: MIN_THRESHOLD,
        branches: MIN_THRESHOLD,
        statements: MIN_THRESHOLD,
      },
    },
  },
});
