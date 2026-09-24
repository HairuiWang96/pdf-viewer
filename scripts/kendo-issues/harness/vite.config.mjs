import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Serves the bare-viewer harness on its own port so it never collides with
// the app's dev server. PDFs come from ./public, written by generate.mjs.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: { port: 5199, strictPort: true },
  // 'error', not 'warn': Vite forwards the browser's console warnings, and the
  // unlicensed Kendo prints a license notice on every page load.
  logLevel: 'error',
});
