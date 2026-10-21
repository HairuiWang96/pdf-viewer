# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this repo is

Two separate things live here:

1. **The PDF viewer spike** (everything outside `src/practice/`). A React + Vite
   app comparing PDF viewer approaches. Each viewer lives on its own branch and
   deploys to Netlify as `https://<branch>--pdf-viewer-compare.netlify.app`.
   Research and spec work, not production: thoroughness matters more than
   speed. Write-ups live in the root `*.md` files (`ATTACHMENT-EXTRACTION.md`,
   `TESTING.md`, …).
   - **Active branch: `libpdf-attachments`** (the KendoReact viewer, with
     attachments read by libpdf). All current work, including `src/practice/`,
     happens here.
   - **Dormant since mid-September:** `pdf-lib-attachments`,
     `kendo-react-no-attachments`, `kendo-react-all`, `pdfjs-viewer`,
     `iframe-viewer`, `react-pdf`, `kendo-pdf-viewer`, and `master` (kept at its
     base commit on purpose). Don't switch to or change them unless asked.
2. **The practice folder** (`src/practice/`). A copy of code from another
   project, **doc-viewer**, which lives on another computer. It exists to test
   and review that code here. It is **not run as an app**: nothing routes to
   it. Only its tests, typecheck and lint run.

## Commands

Node 22 and npm 12 are required (`engines` + `engine-strict` in `.npmrc`).
npm 10 crashes on the Kendo peer dependencies; installing with
`--legacy-peer-deps` silently drops most of Kendo. If the shell defaults to an
older Node, put Node 22 first on PATH before running anything.

| Task | Command |
| --- | --- |
| Dev server | `npm run dev` |
| Build (typecheck + bundle) | `npm run build` |
| Typecheck only | `npx tsc -b --noEmit` |
| Lint | `npm run lint` |
| Tests | `npm test` (one file: `npx vitest run <path>`) |
| Coverage | `npm run test:coverage` |
| Serve the production build | `npm run preview` |

Use `tsc -b`, not `tsc -p .`: the root tsconfig only references the others, so
`-p .` checks nothing.

## The practice folder

- **Source of truth: doc-viewer.** This folder copies it. Changes made here
  are proposals; the user copies them back to doc-viewer by hand. When doc-viewer
  and this copy disagree, doc-viewer wins.
- **How code moves:** the user pastes doc-viewer files into the chat. There is
  no access to doc-viewer from here, so what isn't pasted hasn't been seen;
  say so rather than guess. When suggesting a change for doc-viewer, give the
  exact edit, using doc-viewer's paths (see the differences below).
- **Keep it in step:** when the user pastes a file from the other project, match
  it here, adapting only import paths. Mark every practice-only difference in
  the file's header comment ("Changed from the original: …"), and mark proposed
  changes not yet in the other project as such.
- **Stand-ins:** files with no backend here (`api/fetchDocumentDetails.ts`,
  `utils/caseStamp.ts`) are stand-ins and say so in their header.
- **Differences in doc-viewer:**
  - code lives in `src/features/viewer/…` (here: `src/practice/features/viewer/…`)
  - tests live in `test/` mirroring `src/`, not next to components, so their
    imports look like `'../../../../src/features/viewer/components/…'`
  - ESLint is stricter: type-aware `typescript-eslint` rules
    (`no-unnecessary-type-assertion`, `unbound-method`, …) and **no**
    `react-hooks` plugin, so `eslint-disable react-hooks/...` comments fail there
  - no `preview` script: use `npx vite preview` after `npm run build`
  - runs on Linux, so file names are case-sensitive in imports
- **Stack (both):** React 19, KendoReact (PDFViewer, Drawer, DropDownList),
  Zustand (`data/viewerStore.ts`), TanStack Query (`useLoadViewerDocument`),
  libpdf for attachments, Vitest + Testing Library.

## Working conventions

- **Verify, don't assume.** Run the typecheck, tests and lint before saying
  something works. For layout or behaviour jsdom can't check, check it in a
  real browser (Playwright is installed) and say so.
- **Tests must be able to fail.** After writing a test, break the code on
  purpose and confirm the test catches it.
- **Root cause before fallback.** Find why a value is wrong before patching the
  display with `?? something`.
- **Code review on request.** Run `/code-review` when the user asks for it,
  not after every change. When a larger piece of work is finished (a feature, a
  batch of doc-viewer changes), suggest it in one line, e.g.
  `/code-review high src/practice`, and leave the decision to the user.
- **Styles** go in `src/practice/app/global.css` as classes, not inline styles.
- **Git:** commit and push only when asked. Before committing, run the
  typecheck, tests and build. Work is on the `libpdf-attachments` branch;
  end commit messages with the Co-Authored-By line.
- **Explanations:** short and beginner-friendly by default. Plain words, and
  React ideas explained with examples from this code (see
  `src/practice/features/viewer/REACT-BASICS.md`). More detail only when asked.
