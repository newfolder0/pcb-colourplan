import { defineConfig } from 'vitest/config';

// Core logic is framework-agnostic and runs in a Node environment.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
