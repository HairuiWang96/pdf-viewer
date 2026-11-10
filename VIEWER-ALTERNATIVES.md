# Replacing KendoReact's PDF Viewer — known issues of the alternatives

Researched 2026-11-10 from each library's issue tracker, forums and docs. **Unlike
[KENDO-LIMITATIONS.md](KENDO-LIMITATIONS.md), nothing here has been tested in this
repo yet.** Treat each row as "reported", not "confirmed". See
[How to confirm it](#how-to-confirm-it) for the next step.

## The short version

react-pdf, Mozilla's PDF.js viewer and Kendo all run the same engine: pdf.js (see
[PDF-LIBRARIES.md](PDF-LIBRARIES.md)). **Kendo's worst problems come from Kendo's
wrapper, not from pdf.js.** Kendo draws every page at once, at 3× the screen's pixel
ratio, and adds one search highlight per matched character. So the other pdf.js options
avoid those problems. They still share pdf.js's own limits: iOS canvas memory, and
printing documents whose pages differ in size.

| | Engine / cost | Large files | Search | Print | Mobile | Upkeep |
|---|---|---|---|---|---|---|
| **KendoReact** (current) | pdf.js, paid | ❌ Tab crashes at 400+ pages | ❌ Freezes for seconds to minutes | ❌ Wrong order, blank sheets | iOS stops at 20 pages (untested) | Maintained; issues open since 2023 |
| **react-pdf** (wojtekmaj) | pdf.js, free (MIT) | You build it: it draws only the pages you give it | **None built in** | **None built in** | iOS canvas memory errors unless you cap the pixel ratio | Very active; 7 open issues |
| **PDF.js viewer** (Mozilla) | pdf.js, free (Apache 2.0) | ✅ Draws only the pages near the view, out of the box | ✅ Built in | Built in; mixed page sizes can split or stretch | iOS canvas limits | Very active; an iframe, not a component |
| **EmbedPDF** | PDFium, free (MIT) | Good, but memory runs out on huge files | Bugs on large scanned files and some matches | Out of memory on huge files | Some mobile annotation bugs | Young and changing fast; 205 open issues |
| **@react-pdf-viewer/core** | pdf.js, free | — | — | — | — | ❌ **Archived March 2026.** Avoid |
| **Nutrient / Apryse / Syncfusion** | Own engines, paid (roughly $25–50k a year*) | Generally better; Apryse slows past ~20k pages | Built in | Built in; Syncfusion's server mode is slow | — | Vendor support; Apryse is heavy |

\*Prices come from Nutrient's own comparison page, so may be biased.

**Recommendation:**
- **PDF.js viewer** fixes Kendo's confirmed problems with the least work. The cost is
  less control over the look. It already exists on the `pdfjs-viewer` branch.
- **react-pdf** gives the most control. But you build page virtualization, search and
  print yourself, which are the parts Kendo got wrong.
- **EmbedPDF** is worth watching, but too new to depend on.
- **A paid SDK** only makes sense if you need annotations, redaction or form editing.

## Library by library

### react-pdf (wojtekmaj)

A set of React components (`<Document>`, `<Page>`) around pdf.js. It is building
blocks, not a finished viewer: there is no toolbar, pager, zoom box, search or print.

- **Large files are your job.** It draws every `<Page>` you render. Its FAQ says to
  render only the pages in view (virtualization), for example with react-window's
  `VariableSizeList` when page sizes differ. pdf.js suggests at most about 25 pages at
  a time ([discussion #1691](https://github.com/wojtekmaj/react-pdf/discussions/1691),
  [#1319](https://github.com/wojtekmaj/react-pdf/issues/1319)). Users report that the
  virtualization is hard to get right.
- **No search.** Native pdf.js search is an open feature request. Highlighting
  matches means writing a custom text renderer.
- **No print.** You would build it, as this repo's `ToolbarPrint` already does for Kendo.
- **iOS memory.** "Total canvas memory use exceeds the maximum limit (384 MB)"
  ([#1601](https://github.com/wojtekmaj/react-pdf/issues/1601),
  [#1020](https://github.com/wojtekmaj/react-pdf/issues/1020)) and "Canvas area exceeds
  the maximum limit" ([#1149](https://github.com/wojtekmaj/react-pdf/issues/1149)). The
  usual fix is capping the pixel ratio: `devicePixelRatio={Math.min(2, window.devicePixelRatio)}`.
- **Common setup mistakes:**
  - The worker must be the same pdf.js version as the library ("API version does not
    match the Worker version",
    [#1873](https://github.com/wojtekmaj/react-pdf/issues/1873)).
  - The text layer drifts off the page if you resize pages with CSS instead of the
    `width`/`scale` props ([#556](https://github.com/wojtekmaj/react-pdf/issues/556)).
  - `file` and `options` must be memoized, or each render downloads the file again.
- **Status:** v11.0.0 (September 2026) needs React 19 (fine here) and pdfjs-dist 6.3.
  It drops older browsers: an open docs issue says even the legacy worker isn't enough
  below Chrome 145.

### PDF.js viewer (Mozilla)

The finished viewer that Firefox uses: a whole web page (`viewer.html`) embedded in an
iframe. This repo's `pdfjs-viewer` branch uses it.

- **Large files:** draws only pages near the view and keeps a small cache, so it
  avoids Kendo's crash. Not yet measured here.
- **Search:** built in. It searches as you go and highlights each match, not each
  character.
- **Print, with mixed page sizes:** landscape pages print shrunk onto portrait sheets,
  or pages split across sheets in Chrome
  ([#12611](https://github.com/mozilla/pdf.js/issues/12611),
  [#4514](https://github.com/mozilla/pdf.js/issues/4514),
  [#6800](https://github.com/mozilla/pdf.js/issues/6800)). This is the same family of
  problem as Kendo's #3742.
- **Fit-width with mixed page sizes** fits to the wrong page
  ([#18240](https://github.com/mozilla/pdf.js/issues/18240)).
- **iOS canvas limits:** even with `maxCanvasPixels` lowered, a zoomed page can go past
  Safari's 16.7-million-pixel canvas limit
  ([#17976](https://github.com/mozilla/pdf.js/discussions/17976),
  [#11297](https://github.com/mozilla/pdf.js/issues/11297)).
- **It isn't a React component.** Our toolbar buttons (attachments, case stamp, our
  print) must go into its HTML or talk to it across the iframe. Restyling means editing
  its CSS. Each pdf.js upgrade means re-applying those edits.
- **Browser support:** the legacy build supports Chrome 125+ and Safari 18+
  ([FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)).

### EmbedPDF

A newer open-source viewer built on PDFium (Chrome's PDF engine) compiled to
WebAssembly, with a React package.

- **Huge files:** around page 11,000 of a 40,000-page file, scrolling stops, and Print
  or Export fails with out of memory. PDFium's memory only grows, up to WebAssembly's
  2 GB limit ([#649](https://github.com/embedpdf/embed-pdf-viewer/issues/649)).
- **Search:** repeated search on a large scanned PDF aborts
  ([#853](https://github.com/embedpdf/embed-pdf-viewer/issues/853)). It misses text
  that spans two text runs
  ([#848](https://github.com/embedpdf/embed-pdf-viewer/issues/848)).
- **Other open bugs:** zoom jiggles with fit-to-page (#904), text boxes are wrong on
  rotated pages (#892), outline titles in Hebrew or Arabic lay out left to right
  (#1014), and a scrollbar flickers at some widths.
- **Firefox:** early versions threw a `TouchEvent` error and couldn't select text.
  The developer says that is fixed
  ([Show HN](https://news.ycombinator.com/item?id=44901683)).
- **Licence:** MIT, with PDFium under Apache 2.0. One plugin was published without a
  licence field ([#816](https://github.com/embedpdf/embed-pdf-viewer/issues/816)).

### @react-pdf-viewer/core

Archived and read-only since March 2026. Its last release was about three years ago,
and 359 issues are still open, including large files loading slowly
([#1468](https://github.com/react-pdf-viewer/react-pdf-viewer/issues/1468)) and Safari
crashes ([#490](https://github.com/react-pdf-viewer/react-pdf-viewer/issues/490)). It
is still downloaded a lot, which is why it shows up in comparisons. Don't pick it.

### Commercial SDKs: Nutrient (PSPDFKit), Apryse (PDFTron), Syncfusion

Full document SDKs with their own engines and full UIs (thumbnails, outline,
attachments, annotations).

- **Nutrient:** a PDFium-based engine that loads in pieces as needed. Next.js 16 with
  Turbopack can break its bundle when building
  ([common issues](https://www.nutrient.io/guides/web/troubleshooting/common-issues/)).
- **Apryse:** its own C++ engine compiled to WebAssembly. The WebViewer folder is about
  265 MB, and npm adds about 60 MB
  ([forum](https://community.apryse.com/t/how-to-reduce-file-size-of-production-build/10495)).
  Users report slow navigation and blank pages above about 20,000 pages
  ([forum](https://community.apryse.com/t/issue-rendering-large-pdf-files-in-web-viewer/11511)).
- **Syncfusion:** can run in the browser or with a server. The server mode had a 30 MB
  file limit, raised in 2025
  ([forum](https://www.syncfusion.com/forums/196730/server-backed-pdf-viewer-30mb-pdf-limit)).
  Printing fetches each page from the server as an image, so it's slow for long files.
- **Cost:** sold by quote. Nutrient's own estimate is $25–40k a year for Nutrient and
  $30–50k for Apryse, self-hosted
  ([nutrient.io](https://www.nutrient.io/sdk/vs/apryse/)).

## How to confirm it

The Kendo checks in [scripts/kendo-issues/](scripts/kendo-issues/) test a bare viewer
with generated PDFs. Pointing the same checks at the `pdfjs-viewer` and `react-pdf`
branches would turn this page into measured results:

| Check | Question for the alternatives |
|---|---|
| `large-file.mjs` | Do 400- and 1,300-page files open without crashing? |
| `search.mjs` | Does searching `e` on 60 pages still freeze the page? |
| `print.mjs` | Right order, no blank sheets? |
| `scroll.mjs` | Mixed portrait and landscape pages: does scrolling stay right? |

Still untested for every option: Safari, Firefox, Windows, and real iOS and Android
devices.

## Sources

- react-pdf: [issues](https://github.com/wojtekmaj/react-pdf/issues),
  [releases](https://github.com/wojtekmaj/react-pdf/releases),
  [FAQ](https://github.com/wojtekmaj/react-pdf/wiki/Frequently-Asked-Questions)
- pdf.js: [FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)
  and the issues linked above
- EmbedPDF: [issues](https://github.com/embedpdf/embed-pdf-viewer/issues),
  [BigGo on Firefox and licensing](https://finance.biggo.com/news/202508150114_EmbedPDF_Firefox_Issues_and_Licensing_Concerns)
- @react-pdf-viewer: [Libraries.io](https://libraries.io/npm/react-pdf-viewer-core),
  [issues](https://github.com/react-pdf-viewer/react-pdf-viewer/issues)
- Syncfusion: [loading large PDFs](https://help.syncfusion.com/document-processing/pdf/pdf-viewer/react/document-handling/load-large-pdf)
- Background: [Nutrient on react-pdf performance](https://www.nutrient.io/blog/react-pdf-performance-optimization/),
  [Safari canvas limit](https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/)
