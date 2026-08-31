# PDF Viewer

A React-based PDF viewer with thumbnail navigation, page controls, and a document details panel.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```text
src/
├── components/                 # UI components (each in its own folder)
│   ├── Layout/                 # App shell — header + main content area
│   ├── PageNavigation/         # Prev/next buttons and page number controls
│   ├── PdfDetails/             # Right sidebar showing document metadata
│   ├── KendoPdfViewer/         # Main PDF rendering area (uses KendoReact PDF Viewer)
│   └── ThumbnailSidebar/       # Left sidebar with clickable page thumbnails
├── constants/                  # Named constants (page widths, defaults)
│   └── pdf.ts
├── data/                       # Static/mock data
│   └── pdf-metadata.json
├── hooks/                      # Custom React hooks (business logic)
│   └── usePdfViewer.ts
├── types/                      # Shared TypeScript interfaces
│   └── pdf.ts
├── App.tsx                     # Root component — pure composition, no logic
├── main.tsx                    # Entry point
└── index.css                   # Global styles and CSS custom properties
```

## Tech Stack

- [React 19](https://react.dev/) — UI framework
- [TypeScript](https://www.typescriptlang.org/) — type safety
- [Vite](https://vite.dev/) — build tool and dev server
- [KendoReact PDF Viewer](https://www.telerik.com/kendo-react-ui/components/pdf-viewer/) — document rendering (commercial, see below)
- [PDF.js](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) — page thumbnails

## KendoReact licensing

This branch (`kendo-pdf-viewer`) drops react-pdf entirely and renders documents
with the KendoReact PDF Viewer. KendoReact is a **commercial** library: without an
activated license it still runs, but it renders a watermark over the component
and logs a license banner in the console.

To activate a trial or paid license:

1. Get a license key from your [Telerik account](https://www.telerik.com/account/your-licenses/license-keys).
2. Save it as `kendo-ui-license.txt` in the project root, or set the
   `KENDO_UI_LICENSE` environment variable.
3. Run `npx kendo-ui-license activate`.

The key file is not committed — keep it out of version control.

### What changes on this branch

- The main pane is a single scrolling document with Kendo's own toolbar
  (pager, zoom, text selection, search, download, print) instead of the
  custom `PageNavigation` bar.
- `react-pdf` is no longer a dependency. The thumbnail rail now renders pages
  to PNGs with PDF.js directly (`usePdfThumbnails`), importing the same
  `pdfjs-dist/legacy` build and worker bundle the Kendo viewer uses. Keeping a
  single PDF.js copy matters: mismatched API and worker versions make PDF.js
  refuse to load a document, which shows up as an empty viewer reading
  "0 of 0" pages.
- Thumbnails and the main view stay in sync: clicking a thumbnail scrolls the
  Kendo viewer, and scrolling the viewer highlights the matching thumbnail.
  Note that Kendo's `scrollToPage` takes a zero-based index while its
  `onPageChange` event reports one-based page numbers.
- The stamp toggle still works — the stamped blob URL is handed straight to
  the viewer.
- `PageNavigation/` is left in the tree but unused; Kendo ships its own pager
  in the toolbar.
