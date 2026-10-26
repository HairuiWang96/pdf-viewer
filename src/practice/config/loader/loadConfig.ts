// Copy of the other project's src/config/loader/loadConfig.ts. Nothing in the
// practice serves config/config.json, so a call here would fail; only the
// typecheck and lint run against it.
//
// Changed from the original: added the learning comments about
// import.meta.env below. No code changes.

// In short: the app gets its settings from two places, at two different times.
//
// 1. import.meta.env: fixed when the app is BUILT.
//    Vite fills it in when it builds, and it never changes after that. It
//    holds facts about the build: dev or production, and which folder the app
//    lives in (BASE_URL, from `base: '/doc-viewer/'` in vite.config.ts).
//
// 2. config.json: read every time the page OPENS.
//    loadConfig() below downloads it on each page load. It holds facts about
//    the server: which API host (AUTH_API_HOSTNAME) and PORT. So the same
//    build can go to test and to production; each server just puts a
//    different config.json next to it.
//
// loadConfig() uses the first to find the second:
//   fetch(`${import.meta.env.BASE_URL}config/config.json`)
//          ↑ '/doc-viewer/' (build time)  ↑ the file it downloads (load time)
//
// TypeScript has to be told these exist: `"types": ["vite/client"]` in
// tsconfig does it for import.meta.env, ../globals.d.ts for
// __LOCAL_DEV_SERVER__ (explained in runtime.ts, where it is used).

// More detail. Where import.meta.env comes from:
//
// 1. `import.meta` is plain JavaScript. Every module (file) gets one, an
//    object with facts about that file, e.g. `import.meta.url`.‼️
// 2. Vite adds `.env` to it, with facts about the current build:
//
//      value      meaning                       npm run dev     npm run build
//      MODE       name of the mode              'development'   'production'
//      DEV        running the dev server?       true            false
//      PROD       production build?             false           true
//    ‼️BASE_URL   folder the app is served from  `base` in vite.config.ts:
//                                                 '/doc-viewer/' in doc-viewer
//                                                 ('/' when `base` is not set)
//
//    Your own values can go in a `.env` file too. ‼️ Only names starting with
//    VITE_ are exposed: `VITE_API=abc` becomes `import.meta.env.VITE_API`.
//
// ‼️ Build time, not run time: when Vite builds, it swaps each
// `import.meta.env.X` for its value, so the shipped code says `true`, not
// `import.meta.env.PROD`. That is the difference from config.json, which this
// function fetches every time the page loads:
//   - import.meta.env: what is known when the app is built (mode, base folder)
//   - config.json:‼️   what each server decides (which API host), so one
//                      build can go to test and to production
//
// TypeScript knows about it because tsconfig has `"types": ["vite/client"]`,
// which loads Vite's type definitions. Without it, `import.meta.env` would be
// a type error.
//
// __LOCAL_DEV_SERVER__ (used in runtime.ts) is the same idea, but the project
// defines it itself, in doc-viewer's vite.config.ts:
//
//   define: { __LOCAL_DEV_SERVER__: JSON.stringify(command === 'serve') }
//
// ‼️`command` is 'serve' for `npm run dev` (and when Vitest runs the tests) and
// 'build' for `npm run build`. So it is true on your computer, false in the
// built app. Vite's own types don't know this name, so it needs its own
// declaration (see ../globals.d.ts).
export async function loadConfig(): Promise<AppConfig> {
  // doc-viewer's BASE_URL is '/doc-viewer/', so this fetches
  // '/doc-viewer/config/config.json'.
  // cache: 'no-store'        always download a fresh copy (a changed config
  //                          needs no hard refresh)
  // credentials: 'include'   send the cookies with the request
  const res = await fetch(`${import.meta.env.BASE_URL}config/config.json`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('Failed to load appliation configuration.');
  }

  return (await res.json()) as AppConfig;
}

export interface AppConfig {
  AUTH_API_HOSTNAME: string;
  PORT: string;
}
