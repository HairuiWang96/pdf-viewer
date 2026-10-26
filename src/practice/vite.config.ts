// Copy of the other project's vite.config.ts (at its root; here it sits at the
// root of the practice folder). Nothing here uses it: this repo runs on its
// own vite.config.ts at the top. It is kept to read alongside runtime.ts and
// loadConfig.ts, and the typecheck and lint still run against it.
//
// Changed from the original: added the learning comments on the coverage
// reporters and the junit reporter.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  base: '/doc-viewer/',
  plugins: [react()],
  define: {
    __LOCAL_DEV_SERVER__: JSON.stringify(command === 'serve'),
  },

  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/doc-viewer/v1/doc-viewer': {
        target: 'http://localhost:5174',
        changeOrigin: true,
      },
    },
  },

  test: {
    environment: 'jsdom',
    setupFiles: './test/setup.ts',
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      reportsDirectory: './coverage',
      // Coverage = which lines of the code ran during the tests. A reporter
      // decides how that result is written out:
      //   - text:      a table printed in the terminal, for you to read
      //   - cobertura: the same result as a file, cobertura-coverage.xml in
      //                ./coverage (reportsDirectory above), for machines.
      //                Cobertura is a standard XML format for coverage that
      //                CI tools (GitLab, Azure DevOps, Jenkins) read to show
      //                coverage in a merge request, e.g. marking lines no test
      //                ran. Most likely here for doc-viewer's CI pipeline.
      reporter: [
        ['text', {}],
        ['cobertura', { file: 'cobertura-coverage.xml' }],
      ],
    },
    // Same idea as cobertura, but for the test results (passed or failed)
    // rather than coverage: verbose prints each test in the terminal, junit
    // writes them to ./reports/junit.xml in a standard format CI tools read.
    reporters: ['verbose', ['junit', { outputFile: './reports/junit.xml' }]],
    build: {
      outDir: '../dist', // output to parent's dist folder
      emptyOutDir: true, // clear dist before building
    },
  },
}));
