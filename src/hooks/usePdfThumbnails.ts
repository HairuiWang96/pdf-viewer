import { useEffect, useState } from 'react';
// The *legacy* API build, matching what the KendoReact PDF Viewer imports.
// Beyond version-matching, the legacy build is the one that carries core-js
// polyfills — including Map.prototype.getOrInsertComputed, which PDF.js 5.5
// calls and Safari 18 does not ship. Loading it patches the global prototype
// for the whole realm. See the note below.
//
// Only a type is imported here now, which loads nothing: the hook draws from
// the viewer's document rather than calling getDocument itself. Kendo's own
// import of this build is what installs the polyfill.
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
// Registers the PDF.js worker on `globalThis`. This is the same worker bundle
// the KendoReact PDF Viewer imports, so both share one PDF.js instance —
// mismatched API/worker versions make PDF.js refuse to load a document.
import 'pdfjs-dist/build/pdf.worker.min.mjs';

/**
 * DO NOT set `pdfjs.GlobalWorkerOptions.workerSrc` on this branch.
 *
 * Left unset, PDF.js finds `globalThis.pdfjsWorker` from the import above and
 * runs the "fake worker" on the main thread. That is the only reason Safari
 * works here: this worker bundle is the *modern* build, which calls
 * `Map.prototype.getOrInsertComputed` without polyfilling it, but on the main
 * thread it inherits the polyfill the legacy API installed.
 *
 * Setting `workerSrc` spawns a real Worker, which has its own global scope
 * that a main-thread polyfill cannot reach — and Safari breaks immediately,
 * with "getOrInsertComputed is not a function" on every page render. Tempting
 * change, since a real worker moves parsing off the main thread.
 *
 * If you do want a real worker, point it at the legacy worker build
 * (`pdfjs-dist/legacy/build/pdf.worker.min.mjs`) so both halves carry the
 * polyfill. That is what the react-pdf branch does, via a Vite alias.
 */

/** Stable empty array, so callers don't re-render on every miss. */
const NO_THUMBNAILS: string[] = [];

/**
 * Renders every page of a PDF to a small PNG data URL, for the thumbnail rail.
 *
 * The KendoReact PDF Viewer has no thumbnail component, so we drive PDF.js
 * directly here rather than pulling in a second rendering library.
 *
 * ── Why it draws from the viewer's document ──
 *
 * It used to open the file itself with `getDocument(filePath)`. That was a
 * second full download of every document: Chrome's cache shared it on a
 * small file but not on the 28 MB fixture, where production downloaded the
 * file twice — once for Kendo, once for this (ATTACHMENT-EXTRACTION.md §5).
 *
 * Kendo already holds the parsed PDF.js document and hands it up through
 * `onDocumentLoad`, so the rail renders from that: no download, no second
 * parse. The cost is ordering — thumbnails start once Kendo has loaded,
 * rather than in parallel — which matters little, since both were waiting on
 * the same full download anyway.
 *
 * The document is Kendo's, not ours, so this hook must never destroy it or
 * call `page.cleanup()` on its pages: Kendo is drawing the same pages and
 * would have to rebuild what cleanup frees. When the case changes Kendo
 * destroys the old document itself, and any render still running here then
 * fails; `cancelled` is set by then, so that failure is expected and quiet.
 *
 * `pdfDocument` is null until the viewer has loaded, and the rail shows
 * nothing until then.
 */
export default function usePdfThumbnails(pdfDocument: PDFDocumentProxy | null, width: number) {
  // The rendered pages are stored alongside the document they came from, so a
  // document that is still rendering shows nothing rather than the previous
  // document's thumbnails.
  const [rendered, setRendered] = useState<{
    pdfDocument: PDFDocumentProxy | null;
    pages: string[];
  }>({ pdfDocument: null, pages: NO_THUMBNAILS });

  useEffect(() => {
    if (!pdfDocument) return;
    const doc = pdfDocument;
    let cancelled = false;

    async function renderPages() {
      const pages: string[] = [];

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        if (cancelled) return;

        const page = await doc.getPage(pageNumber);
        // Render at whatever scale makes the page come out `width` px wide.
        const scale = width / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({ canvas, viewport }).promise;
        pages.push(canvas.toDataURL());
      }

      if (!cancelled) setRendered({ pdfDocument: doc, pages });
    }

    renderPages().catch((error) => {
      if (!cancelled) console.error('Failed to render PDF thumbnails:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDocument, width]);

  return pdfDocument && rendered.pdfDocument === pdfDocument ? rendered.pages : NO_THUMBNAILS;
}
