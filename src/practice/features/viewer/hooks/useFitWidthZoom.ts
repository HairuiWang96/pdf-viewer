import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { PDFViewerHandle } from '@progress/kendo-react-all';
import { fitWidthZoom, DESKTOP_MAX_FIT_ZOOM, MOBILE_DEFAULT_ZOOM } from '../utils/fitWidthZoom';

// The only thing the fit needs from Kendo's loaded document: a page's width.
// Kendo types the document `any`; it is pdf.js's PDFDocumentProxy, but
// pdfjs-dist only arrives through Kendo, so its types are not imported.
interface PDFPageSource {
  getPage(pageNumber: number): Promise<{
    getViewport(params: { scale: number }): { width: number };
  }>;
}

// Owns the viewer's zoom, so the page can be fitted to the viewer's width.
// Ported from the main viewer's KendoPdfViewer.
//
// Returns:
//   - zoom: pass to Kendo's `zoom`
//   - handleZoom: pass to Kendo's `onZoom`, so its zoom buttons keep working
//   - fitToWidth: call from Kendo's `onLoad`, once both sizes are known
//
// `documentKey` is anything that changes when a new document's viewer appears
// (PDFDocViewer passes its copy of the bytes). It re-arms the resize watch,
// which can only find the viewer once it is on screen.
export function useFitWidthZoom(
  viewerRef: RefObject<PDFViewerHandle | null>,
  isMobile: boolean,
  documentKey: unknown,
) {
  // Ours rather than Kendo's, so it can be set to fit after load
  const [zoom, setZoom] = useState(isMobile ? MOBILE_DEFAULT_ZOOM : DESKTOP_MAX_FIT_ZOOM);

  // True after a zoom by hand, so a desktop resize keeps it. Phones always refit.
  const zoomedByHand = useRef(false);

  const handleZoom = useCallback((event: { zoom: number }) => {
    zoomedByHand.current = true;
    setZoom(event.zoom);
  }, []);

  // Measures the viewer and the first page, and zooms so the page fits.
  // Mobile fits both ways; desktop only shrinks, capped at 100%, so a page that
  // already fits — every ordinary desktop window — is left as it was.
  const fitToWidth = useCallback(async () => {
    const handle = viewerRef.current;
    const pdfDocument = handle?.document as PDFPageSource | undefined;
    const scroller = handle?.element?.querySelector<HTMLElement>('.k-pdf-viewer-canvas');
    if (!pdfDocument || !scroller) return;

    // Page 1 stands for the document, as in Kendo's own fit. The viewport
    // accounts for /Rotate, so a landscape page measures as landscape.
    const page = await pdfDocument.getPage(1);
    const fitted = fitWidthZoom(
      scroller.clientWidth,
      page.getViewport({ scale: 1 }).width,
      isMobile ? Infinity : DESKTOP_MAX_FIT_ZOOM,
    );
    if (fitted === null) return;
    zoomedByHand.current = false;
    setZoom(fitted);
  }, [viewerRef, isMobile]);

  // Refit when the viewer changes width: turning a phone, resizing a window,
  // crossing into the other layout, opening the details drawer. Width only:
  // mobile browsers resize the *height* whenever the address bar slides in or
  // out, and refitting on that would fight the user's scrolling.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const scroller = viewerRef.current?.element?.querySelector<HTMLElement>('.k-pdf-viewer-canvas');
    if (!scroller) return;

    let lastWidth = scroller.clientWidth;
    const observer = new ResizeObserver(() => {
      if (scroller.clientWidth === lastWidth) return;
      lastWidth = scroller.clientWidth;
      if (isMobile || !zoomedByHand.current) void fitToWidth();
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [viewerRef, documentKey, isMobile, fitToWidth]);

  // Refit when the layout switches between mobile and desktop, e.g. a window
  // snapped from 1280 px to 640 px, or a tablet turned sideways.
  //
  // The resize watch above can miss this. The switch restarts it, and it
  // remembers the width at that moment, which is already the new one. When the
  // resize report then arrives, the width matches what it remembered, so it
  // sees no change and does not refit. The page would keep the old zoom (too
  // wide, or too small) until the width changed again.
  //
  // Always refits, even after a zoom by hand: a new layout is a new screen.
  const lastIsMobile = useRef(isMobile);
  useEffect(() => {
    if (lastIsMobile.current === isMobile) return;
    lastIsMobile.current = isMobile;
    void fitToWidth();
  }, [isMobile, fitToWidth]);

  return { zoom, handleZoom, fitToWidth };
}
