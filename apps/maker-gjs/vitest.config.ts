import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Only the pure-data / parser modules get unit-tested here —
    // anything that touches `@girs/*` or Gio is GJS-only and lives
    // under the manual smoke walkthrough.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
