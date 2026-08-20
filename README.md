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
│   ├── PdfViewer/              # Main PDF rendering area (uses react-pdf)
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
- [react-pdf](https://github.com/wojtekmaj/react-pdf) — PDF rendering (built on PDF.js)
