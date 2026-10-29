import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

// Serves the audio-unpack demo on its own port so it never collides with the
// app's dev server. The test PDFs come from the repo's public/ folder.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  server: { port: 5194, strictPort: true, open: true },
});
