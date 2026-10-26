// Copy of the other project's vite-env.d.ts (at its root; here it sits at the
// root of the practice folder).
//
// Changed from the original: added this header and the learning comment
// below.

// Tells TypeScript that __LOCAL_DEV_SERVER__ exists and is a boolean. The
// value itself comes from `define` in vite.config.ts (true under
// `npm run dev` and Vitest, false in a build); Vite swaps the name for true
// or false when it builds. TypeScript never reads vite.config.ts, so without
// this line runtime.ts fails with "Cannot find name '__LOCAL_DEV_SERVER__'".
declare const __LOCAL_DEV_SERVER__: boolean;
