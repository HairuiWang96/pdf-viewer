# KendoReact PDF Viewer — limitations and known issues

Researched and tested 2026-09-24 against `@progress/kendo-react-pdf-viewer` 16.1.0, which
runs on `@progress/kendo-pdfviewer-common` 1.0.2 and pdf.js 5.5.207.

**Telerik publishes no known-limitations page for the PDF Viewer.** The real list is the
[kendo-react issue tracker](https://github.com/telerik/kendo-react/issues), which has 16
open PDFViewer issues, some open since 2023. Most were filed against older versions, so
each one testable on a Mac was retried on 16.1.0 (see [How this was tested](#how-this-was-tested)).

## Results on 16.1.0

| Issue | What was reported | On 16.1.0 |
|---|---|---|
| [#2140](https://github.com/telerik/kendo-react/issues/2140) | Large files make the tab unresponsive | **Confirmed.** The tab crashes |
| [#2783](https://github.com/telerik/kendo-react/issues/2783), [#1597](https://github.com/telerik/kendo-react/issues/1597) | Search freezes the page on large files | **Confirmed.** Freezes last from seconds to minutes |
| [#1819](https://github.com/telerik/kendo-react/issues/1819) | Pages print in the wrong order | **Confirmed** |
| [#3742](https://github.com/telerik/kendo-react/issues/3742) | Printing adds blank sheets, or puts two pages on one sheet | **Confirmed**, and it affects ordinary A4 documents too |
| [#2155](https://github.com/telerik/kendo-react/issues/2155) | Scrolling goes wrong when page sizes differ | **Confirmed** |
| [#2201](https://github.com/telerik/kendo-react/issues/2201) | Unwanted horizontal scrollbar | **Confirmed**, but only when the viewer has no set width |
| [#1549](https://github.com/telerik/kendo-react/issues/1549) | No fit-to-width default zoom | **Confirmed** by the type definitions |
| [#1543](https://github.com/telerik/kendo-react/issues/1543) | Prints come out at low resolution | Not reproduced. Prints are 216–432 dpi |
| [#1539](https://github.com/telerik/kendo-react/issues/1539) | Blurry text when zoomed out | Not reproduced on Mac Chromium |
| [#3727](https://github.com/telerik/kendo-react/issues/3727) | Search text can't be selected in pan mode | Not reproduced on Chromium |
| [#1710](https://github.com/telerik/kendo-react/issues/1710) | On iOS, only the first 20 pages load | Not tested. Needs a device, but the likely cause was found in the code (below) |
| [#3009](https://github.com/telerik/kendo-react/issues/3009) | Crashes on Android 14 | Not tested. Needs a device. Likely the same cause |
| [#2319](https://github.com/telerik/kendo-react/issues/2319) | Some files render blurry in Chrome on Windows | Not tested. Needs Windows |
| [#2080](https://github.com/telerik/kendo-react/issues/2080) | No pinch zoom | An enhancement request, not a bug |

## Confirmed issues

### Every page is drawn at once, at high resolution (#2140, #3009, #1710)

**This is the most serious finding.** Kendo has no virtualization. When a file opens it
draws every page straight away, and each page is drawn at 3× the screen's pixel ratio,
whatever the zoom (`scale()` in `kendo-pdfviewer-common/dist/es/utils.js`). On a 2×
screen one A4 page is 3,571 × 5,051 pixels, about 72 MB of canvas memory.

The screen's pixel ratio is how many physical pixels it uses for each CSS pixel, in each
direction. A typical office monitor is 1×; a MacBook or other retina laptop is 2×, and
phones are often 3×. A 2× screen has 4 times the pixels, so the same file needs 4 times
the memory there.

Even files that open freeze the page while every page is drawn. The time is the longest
stretch in which the page can't respond to scrolling or clicks. Times vary by about 20%
between runs:

| File | 1× screen | 2× (retina) screen |
|---|---|---|
| 60 pages | Opens, 0.6 s freeze | Opens, 1.5 s freeze |
| 100 pages | Opens, 0.8 s freeze | Opens, 2.3 s freeze |
| 200 pages | Opens, 3.0 s freeze | Opens, 6.9 s freeze |
| 400 pages | Opens, 10.6 s freeze | **Tab crashes** after about 6 s |
| 1,300 pages | **Tab crashes** after about 9 s | **Tab crashes** after 5–10 s (3 of 3 runs) |

On iOS, Kendo draws at 1× the pixel ratio instead of 3×. That makes an iPhone page
about 18 MB, so 20 pages come to roughly 360 MB, close to the canvas memory limit on iOS
Safari. That would explain #1710's "stops at page 20", but it hasn't been checked on a
device.

### Search freezes the page (#2783, #1597)

Search runs on every keystroke with no delay, and creates one highlight element per
matched *character*. How long the page freezes depends on how many matches there are,
not how many pages:

| File | Search | Page frozen for |
|---|---|---|
| 60 pages | `#` (no matches, as a control) | 0.7 s |
| 60 pages | `e` (the first letter typed) | **54 s** |
| 60 pages | `evidence`, pasted in (2,401 matches) | **31 s** |
| 200 pages | `evidence`, pasted in | **Over 3 minutes** (still frozen when the test stopped) |
| 200 pages | `PAGE 150` (a rare phrase) | 2.5 s |

The test pages are dense text, so a real document will usually freeze for less time.
But typing the first letter of any common word runs the worst case.

### Pages print in the wrong order (#1819)

Kendo adds each page to the print window when that page finishes drawing, not in page
order. A 30-page file in which every fourth page was slow to draw printed as
`2, 3, 4, 6, 7, 8 … 30, 1, 5, 9, 13 … 29`. The exact order changes from run to run, so
the same document can print differently each time.

### Printing adds blank sheets (#3742)

Kendo sizes each print page to the full paper size. With the browser's default print
margins, every page spills onto an extra sheet that is almost blank:

| Document | A4 paper | A5 paper | A1 paper |
|---|---|---|---|
| 5 A4 portrait pages | 10 sheets | 15 sheets | 5 sheets (correct) |
| 5 A4 landscape pages | 10 sheets | 10 sheets | 3 sheets (two pages per sheet) |

The issue only mentions landscape pages, but plain A4 portrait documents printed on A4
paper double too.

### Scrolling with mixed page sizes (#2155)

`scrollToPage` multiplies the *first* page's height by the page number
(`kendo-pdfviewer-common/dist/es/common/dom.js`). In a 12-page file where every third
page was landscape, asking for page 7 landed on page 8. The toolbar's page number was
also one behind for every page after the first landscape one. A file with uniform page
sizes behaves correctly.

### 1 px horizontal scrollbar (#2201)

The page box width is rounded down (841 pt) but the text layer isn't (841.89 pt), so the
text layer is about 1 px wider. This shows as a scrollbar only when the viewer's width
comes from its content, as in the reporter's `display: flex` layout with no width set.
It reproduced with the reporter's own PDF and with a test PDF. A viewer with a set width
(`flex: 1`, `width: 100%`) showed no spurious scrollbar across 150 window widths.

## Not reproduced

- **#1543, low-resolution print.** Print images are drawn at 3× the pixel ratio: 216 dpi
  on a 1× screen, 432 dpi on a 2× screen. This looks fixed.
- **#1539, blurry text when zoomed out.** At 80% zoom on a 1× screen, Kendo's text was at
  least as sharp as plain pdf.js drawing the same page at the same size.
- **#3727, search text in pan mode.** With panning confirmed on, triple-click still
  selected the whole search text and the highlight showed. The transparent-selection CSS
  rule the workaround targets applies only to the PDF text layer, and the search box
  isn't inside it in 16.1.0. Only Chromium was tested.

## Missing API and features

- **No fit-to-width or fit-to-page zoom.** `defaultZoom` is typed `number` only
  ([#1549](https://github.com/telerik/kendo-react/issues/1549), open since 2023-04).
  [fitWidthZoom.ts](src/components/KendoPdfViewer/fitWidthZoom.ts) is this repo's
  workaround.
- **The toolbar is fixed to a short list of tools:** `pager`, `spacer`, `zoomInOut`,
  `zoom`, `selection`, `search`, `open`, `download` and `print`. It has no thumbnails,
  outline or bookmarks panel, attachments panel, rotate, or annotation tools, and the
  props don't expose the data to build them. Each one has to be built outside Kendo, as
  this repo does for thumbnails and attachments.

## Fixed issues worth knowing

- **The bundled pdf.js had a security vulnerability**, fixed by a version bump in
  [#2237](https://github.com/telerik/kendo-react/issues/2237). The risk remains: pdf.js
  is pinned inside Kendo's package, so security fixes arrive only when Telerik ships an
  update.
- **Other fixed bugs:** content rendered twice in React Strict Mode
  ([#1495](https://github.com/telerik/kendo-react/issues/1495)), some documents loaded
  rotated ([#1770](https://github.com/telerik/kendo-react/issues/1770)), wide PDFs
  didn't load on Mac ([#1701](https://github.com/telerik/kendo-react/issues/1701)), and
  changing the width jumped back to page 1
  ([#2156](https://github.com/telerik/kendo-react/issues/2156)).
- **Needs `unsafe-inline` in the Content Security Policy.** This was reported against the
  jQuery version
  ([kendo-ui-core #7852](https://github.com/telerik/kendo-ui-core/issues/7852)). It may
  apply to the React version too, but that hasn't been confirmed.

## How this was tested

- **A bare `<PDFViewer>` with no app code around it**, so the results describe Kendo
  16.1.0 itself. The app's own workarounds can't hide or cause a failure. It ran without
  a license key, which adds a watermark and banner but doesn't change behavior.
- **Headless Chromium through Playwright 1.63 on an Apple Silicon Mac**, with screen
  pixel ratios of 1× and 2×.
- **Test PDFs generated with pdf-lib:** dense-text files of 60–1,300 A4 pages, a
  mixed portrait/landscape file, and print files stamped with a binary page-number
  barcode so page order could be read back from pixels. #2201 also used the reporter's
  own PDF from the issue.
- **Freezes were measured** as the longest gap between animation frames, or as the time
  until the page answered a script again.
- **Print pagination used Chrome's print-to-PDF** on Kendo's print window. That's the
  same layout engine as the print dialog, but it hasn't been checked on real paper.
- **Not tested:** Safari, Firefox, Windows, and real iOS or Android devices. Those need
  the Netlify deploy on a device.

### Rerunning the tests

The checks live in [scripts/kendo-issues/](scripts/kendo-issues/). Rerun them after
upgrading Kendo to see which issues are fixed:

```sh
node scripts/kendo-issues/run-all.mjs          # all checks, about 10 minutes
node scripts/kendo-issues/run-all.mjs print    # only the named ones
```

The first run generates the test PDFs into `harness/public/`. Each check prints one line
per result, for example `[#1819] CONFIRMED   30 pages printed in order 2,3,4,...`.
Screenshots and printouts go to `out/`. Both folders are gitignored.

| Script | Issues |
|---|---|
| `large-file.mjs` | #2140 |
| `search.mjs` | #2783, #1597 |
| `scroll.mjs` | #2155 |
| `scrollbar.mjs` | #2201 |
| `print.mjs` | #1819, #1543, #3742 |
| `pan-select.mjs` | #3727 |
| `blur.mjs` | #1539 |

## Sources

- [kendo-react issue tracker](https://github.com/telerik/kendo-react/issues)
- [KendoReact PDFViewer docs](https://www.telerik.com/kendo-react-ui/components/pdfviewer)
- [Telerik forum: FitToWidth on load](https://www.telerik.com/forums/kendo-react-pdf-viewer-make-pdf-fittowidth-on-load)
- [Telerik forum: pdf.js vulnerability](https://www.telerik.com/forums/pdfviewer-pdfjs-vulnerability)
