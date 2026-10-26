// Copy of the other project's src/config/runtime.ts. No code changes.
// __LOCAL_DEV_SERVER__ is declared in ../vite-env.d.ts.
//
// Changed from the original: added the learning comments above
// `declare global` and `const params`, and in getInfo and initRuntime.
import { loadConfig, type AppConfig } from './loader/loadConfig';

// Tells TypeScript that `window` has one extra property, `docViewer`.
//
// The problem it solves: TypeScript has a built-in description of `window`
// (the `Window` type) listing what a browser gives you, like window.location
// or window.alert. `docViewer` is not on it, because this app invents it.
// Without this block, the `window.docViewer = { … }` line below fails with
//   Property 'docViewer' does not exist on type 'Window & typeof globalThis'
//
// How it works:
//   - `interface Window`: an interface with the same name as an existing one
//     does not replace it, it adds to it ("merging"). Window keeps
//     everything it had, plus docViewer.
//   - `declare global`: this file has import/export, so TypeScript treats it
//     as a module, and what is declared in it stays local to the file.
//     `declare global { … }` puts it in the shared, global scope instead, so
//     it extends the real Window.
//
// ‼️Types only: none of this is in the built JavaScript. The real object is
// made below, at `window.docViewer = { … }`; this lets TypeScript check its
// shape, and gives autocomplete for window.docViewer in other files.
//
// Why put it on window at all: so you can type `docViewer.getInfo()` or
// `docViewer.mockApi` in the browser's DevTools console and see which mode
// the app is running in.
declare global {
  interface Window {
    docViewer: {
      mockApi: boolean;
      local: boolean;
      getInfo: () => void;
    };
  }
}

export interface Runtime {
  apiHostname: string;
  apiOrigin: string;
  apiPort: string;
  authLoginPath: string;
  authCheckPath: string;
  docMetadataPath: string;
  docDocumentPath: string;
}

const _runtime = {
  authCheckPath: '/v1/auth/me',
  authLoginPath: '/v1/auth/login',
  docMetadataPath: '/v1/doc-viewer/document/metadata',
  docDocumentPath: '/v1/doc-viewer/document',
};

// window.location is the browser's object for the address of the current
// page, split into parts. For https://example.com:8443/doc-viewer/?api=true:
//
//   part       value                        used in this file
//   protocol   'https:'                     building https://… API URLs
//   hostname   'example.com'                apiHostname with ?api=true
//   port       '8443'                       -
//   origin     'https://example.com:8443'   apiOrigin with ?api=true
//              (protocol + host + port)
//   pathname   '/doc-viewer/'               -
//   search     '?api=true'                  the ?api and ?local switches (here)
//
// Two jobs here:
//   - reading the switches: URLSearchParams turns '?api=true&local=true' into
//     something you can ask, with params.get('api')
//   - building API addresses that match the page: reusing `protocol` means a
//     page on https: calls the API on https: too (browsers block a secure
//     page from calling an insecure address)
//
// It can also move to another page (window.location.href = '/other'); this
// file only reads it.
const params = new URLSearchParams(window.location.search);
const mockApi = params.get('api') === 'true';
const local = params.get('local') === 'true';

window.docViewer = {
  // use documents found in /public
  mockApi,
  // use api/doc-viewer running on localhost:3000
  local,
  getInfo: () => {
    // import.meta.env is filled in by Vite when the app is built; the full
    // explanation is in loader/loadConfig.ts.
    console.info({
      mode: import.meta.env.MODE,
      dev: import.meta.env.DEV,
      prod: import.meta.env.PROD,
      url: import.meta.env.BASE_URL,
    });
  },
};

let runtimeConfig: AppConfig | null = null;

async function initRuntime(): Promise<Runtime> {
  // __LOCAL_DEV_SERVER__ is a build-time value like import.meta.env, but
  // doc-viewer sets it itself, with `define` in vite.config.ts: true on your
  // computer (`npm run dev`, and in tests), false in the real built app.
  if (__LOCAL_DEV_SERVER__) {
    if (local) {
      return {
        ..._runtime,
        apiHostname: 'localhost',
        apiOrigin: `${window.location.protocol}//localhost:3001`,
        apiPort: '3001',
      };
    }
    return {
      ..._runtime,
      apiHostname: '',
      apiOrigin: '/doc-viewer',
      apiPort: '',
    };
  }
  const _runtimeConfig = await loadConfig();
  runtimeConfig = _runtimeConfig;

  // not on local host and have ?api=true
  if (mockApi) {
    return {
      ..._runtime,
      apiHostname: window.location.hostname,
      apiOrigin: `${window.location.origin}/doc-viewer`,
      apiPort: runtimeConfig.PORT,
    };
  }

  return {
    ..._runtime,
    apiHostname: runtimeConfig.AUTH_API_HOSTNAME,
    apiOrigin: `${window.location.protocol}//${runtimeConfig.AUTH_API_HOSTNAME}`,
    apiPort: runtimeConfig.PORT,
  };
}

export function buildRequestUrl(runtime: Runtime, path: string, more?: string): string {
  const _more = more ? `/${more}` : '';
  // auth is fully developed if we are in a live env use it properly
  if (!__LOCAL_DEV_SERVER__ && mockApi) {
    if (path.includes('/auth')) {
      const origin = `${window.location.protocol}//${runtimeConfig?.AUTH_API_HOSTNAME}`;
      return `${origin}${path}${_more}`;
    }
  }
  return `${runtime.apiOrigin}${path}${_more}`;
}

export const runtime: Runtime = await initRuntime();
