import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // lcov.info es lo que consume sonar.javascript.lcov.reportPaths en CI.
      reportsDirectory: './coverage',
      exclude: ['src/generated/**', '**/*.module.ts', '**/main.ts'],
    },
  },
});
