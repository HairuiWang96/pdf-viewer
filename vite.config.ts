// `defineConfig` comes from vitest/config rather than vite so the `test`
// block below is type-checked. It is the same Vite config otherwise.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces so other devices can connect
  },
  test: {
    // jsdom gives the tests a fake DOM to render into. It is not a real
    // browser — no layout engine, no PDF renderer — so anything that depends
    // on actual rendering belongs in manual/device testing, not here.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false, // component CSS imports are no-ops in tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Only measure what we are on the hook for. Everything under `exclude`
      // is either a barrel re-export or a component this branch never renders.
      include: ['src/components/**/*.tsx', 'src/hooks/**/*.ts'],
      exclude: [
        '**/index.ts', // barrel re-exports, no logic
        // Not imported anywhere on this branch — see the note in the summary.
        'src/components/ThumbnailSidebar/**',
        'src/components/PageNavigation/**',
      ],
      // The team requirement. Coverage below any of these fails the run,
      // so CI catches a drop instead of someone noticing months later.
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
