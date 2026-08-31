import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // react-pdf imports bare 'pdfjs-dist', which resolves to PDF.js's modern
      // build. That build calls Map.prototype.getOrInsertComputed, a proposal
      // method Safari 18 does not ship, so every page render throws
      // "getOrInsertComputed is not a function" there while Chromium and
      // Firefox are fine. PDF.js's legacy build carries the polyfill.
      //
      // Anchored so it rewrites only the bare specifier — a plain string alias
      // would also rewrite the legacy path below and recurse.
      { find: /^pdfjs-dist$/, replacement: 'pdfjs-dist/legacy/build/pdf.mjs' },
    ],
  },
  server: {
    host: true, // Listen on all network interfaces so other devices can connect
  },
})
