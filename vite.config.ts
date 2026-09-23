// `defineConfig` comes from vitest/config rather than vite so the `test`
// block below is type-checked. It is the same Vite config otherwise.
import { defineConfig } from 'vitest/config'
import type { Connect, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Lets pdf.js use range requests against the dev and preview servers.
 *
 * Vite already answers a `Range` request with `206 Partial Content`, but it
 * never sends `Accept-Ranges: bytes` on an ordinary response. pdf.js decides
 * from exactly that header on its first request, so without it pdf.js always
 * downloads the whole file in one go. This only adds the header; the ranges
 * themselves are still served by Vite. See ATTACHMENT-EXTRACTION.md §5.
 *
 * Dev-only. Netlify already sends the header — its obstacle is compression.
 */
function advertisePdfRanges(): Plugin {
  const addHeader: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split('?')[0].endsWith('.pdf')) res.setHeader('Accept-Ranges', 'bytes')
    next()
  }
  return {
    name: 'advertise-pdf-ranges',
    configureServer: (server) => { server.middlewares.use(addHeader) },
    configurePreviewServer: (server) => { server.middlewares.use(addHeader) },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), advertisePdfRanges()],
  server: {
    host: true, // Listen on all network interfaces so other devices can connect
  },
  test: {
    // jsdom gives the tests a fake DOM to render into. It is not a real
    // browser — no layout engine, no PDF renderer, no audio decoding — so
    // anything depending on actual rendering or playback belongs in
    // manual/device testing, not here.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false, // component CSS imports are no-ops in tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/components/**/*.tsx', 'src/hooks/**/*.ts'],
      exclude: [
        '**/index.ts', // barrel re-exports, no logic
        // Not rendered on this branch — the KendoReact viewer ships its own
        // pager in its toolbar, so this component is never imported here.
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
