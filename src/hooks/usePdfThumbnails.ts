import { useEffect, useState } from 'react';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
// Registers the PDF.js worker on `globalThis`. This is the same worker bundle
// the KendoReact PDF Viewer imports, so both share one PDF.js instance —
// mismatched API/worker versions make PDF.js refuse to load a document.
import 'pdfjs-dist/build/pdf.worker.min.mjs';

/** Stable empty array, so callers don't re-render on every miss. */
const NO_THUMBNAILS: string[] = [];

/**
 * Renders every page of a PDF to a small PNG data URL, for the thumbnail rail.
 *
 * The KendoReact PDF Viewer has no thumbnail component, so we drive PDF.js
 * directly here rather than pulling in a second rendering library.
 */
export default function usePdfThumbnails(filePath: string, width: number) {
  // The rendered pages are stored alongside the file they came from, so a
  // document that is still rendering shows nothing rather than the previous
  // document's thumbnails.
  const [rendered, setRendered] = useState({ filePath: '', pages: NO_THUMBNAILS });

  useEffect(() => {
    let cancelled = false;

    const loadingTask = getDocument(filePath);

    async function renderPages() {
      const doc = await loadingTask.promise;
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
        page.cleanup();
      }

      if (!cancelled) setRendered({ filePath, pages });
    }

    renderPages().catch((error) => {
      if (!cancelled) console.error('Failed to render PDF thumbnails:', error);
    });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [filePath, width]);

  return rendered.filePath === filePath ? rendered.pages : NO_THUMBNAILS;
}
