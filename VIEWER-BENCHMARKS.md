# Viewer benchmarks — bundle size and transfer cost

Measured 2026-09-04 across the four viewer branches.

| Branch | App JS bundle | Gzipped | Wire transfer¹ | Requests¹ |
|---|---|---|---|---|
| `iframe-viewer` | 397 kB | 128 kB | **0.21 MB** | 3 |
| `react-pdf` | 1,310 kB | 453 kB | **0.52 MB** | 11 |
| `pdfjs-viewer` | 397 kB | 128 kB | **0.67 MB** | 58 |
| `kendo-pdf-viewer` | 2,730 kB | 885 kB | **0.90 MB** | 7 |

¹ First load plus opening one document (`CASE-TEST-BOOKMARKS`), against each branch's
Netlify deploy so compression and hosting are identical across all four.

## What the numbers say

**The self-hosted PDF.js viewer has the smallest app bundle**, tied with the plain
iframe. Its ~12 MB of static assets under `public/pdfjs/` are not bundled — they are
served on demand, and most are never fetched: the locale folder is 2.9 MB but only the
user's language loads (~70 kB), and the cmaps/wasm assets load only when a document
actually needs them.

**react-pdf's bundle is 3× larger** because it compiles pdf.js *into* the app bundle
rather than loading it as separate files.

**KendoReact is the heaviest on both axes** — largest bundle and most bytes on the wire.

**The one place `pdfjs-viewer` loses is request count**: 58 versus 3–11. That costs more
on high-latency connections than the byte total suggests. HTTP/2 multiplexing softens it
and everything caches after the first document, but it is the real tradeoff.

## Method and caveats

Measured with Playwright, summing `request.sizes()` (encoded body + headers) over a cold
page load followed by selecting one test case. Bundle sizes come from each branch's
`npm run build` output.

An earlier attempt that summed *decompressed* response bodies produced substantially
different figures; the table above uses one consistent method across all four branches.
Treat these as directionally reliable rather than precise — they are for comparing
options against each other, not for absolute performance budgeting.
