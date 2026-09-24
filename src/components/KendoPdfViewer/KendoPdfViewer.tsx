import { Children, cloneElement, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { PDFViewer, scrollToPage } from '@progress/kendo-react-all';
import type {
  PDFViewerHandle,
  PDFViewerTool,
  PageEvent,
  ErrorEvent,
} from '@progress/kendo-react-all';
import '@progress/kendo-theme-default/dist/all.css';
import { BottomBarAttachments, ToolbarAttachments } from '../PdfAttachments';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { AttachmentPlacement, PdfAttachment } from '../PdfAttachments';
import { fitWidthZoom, DESKTOP_MAX_FIT_ZOOM, MIN_ZOOM, MOBILE_DEFAULT_ZOOM } from './fitWidthZoom';
import './KendoPdfViewer.css';

interface KendoPdfViewerProps {
  filePath: string;
  fileName: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  onLoadSuccess: (totalPages: number) => void;
  /**
   * Hands up the pdf.js document Kendo parsed internally, so the page can read
   * attachments out of bytes already downloaded instead of requesting the file
   * a second time. Null on a failed load. See `useAttachments` for why the
   * duplicate request was worth removing.
   */
  onDocumentLoad: (document: PDFDocumentProxy | null) => void;
  isMobile: boolean;
  attachments: PdfAttachment[];
  placement: AttachmentPlacement;
}


/**
 * KendoReact PDF Viewer (commercial component — see README for licensing).
 *
 * Unlike the react-pdf viewer, this renders ALL pages in one scrolling
 * container and ships its own toolbar (pager, zoom, search, download,
 * print). So there is no separate PageNavigation bar here — page changes
 * come from the toolbar pager or from scrolling, and are pushed back up
 * so the thumbnail sidebar stays in sync.
 *
 * Embedded attachments are not this component's concern: the page lists them
 * and passes the finished list down, and the placements that live in here
 * render themselves or nothing.
 */

/** Toolbar tools. Mobile drops search and open to fit the narrow bar. */
const DESKTOP_TOOLS: PDFViewerTool[] = [
  'pager',
  'spacer',
  'zoomInOut',
  'zoom',
  'selection',
  'spacer',
  'search',
  'download',
  'print',
];

// No 'spacer' here. Kendo's spacer is a flex-grow element, which on the
// wrapping mobile toolbar (see the CSS) claims whatever is left of the row and
// pushes the rest onto a second line. Packed left, everything fits one row.
const MOBILE_TOOLS: PDFViewerTool[] = ['pager', 'zoomInOut', 'download', 'print'];

export default function KendoPdfViewer({
  filePath,
  fileName,
  currentPage,
  onPageChange,
  onLoadSuccess,
  onDocumentLoad,
  isMobile,
  attachments,
  placement,
}: KendoPdfViewerProps) {
  const viewerRef = useRef<PDFViewerHandle | null>(null);

  // The zoom is ours rather than Kendo's, so it can be set to fit after load.
  // Kept here, outside the per-file remount, so the next document opens at the
  // last zoom and the jump when it refits is small.
  const [zoom, setZoom] = useState(isMobile ? MOBILE_DEFAULT_ZOOM : DESKTOP_MAX_FIT_ZOOM);

  // Set once the reader zooms by hand, cleared whenever we fit. A width change
  // only refits while it is clear: otherwise someone reading at 150% on a
  // desktop would be snapped back every time they resized the window.
  const zoomedByHand = useRef(false);

  const handleZoom = useCallback((event: { zoom: number }) => {
    zoomedByHand.current = true;
    setZoom(event.zoom);
  }, []);

  /**
   * Measures the viewer and the first page, and zooms so the page fits.
   *
   * Mobile fits in both directions — the whole point is a page as wide as the
   * phone. Desktop only shrinks, capped at 100%, so a page that already fits
   * is left exactly as it was.
   */
  const fitToWidth = useCallback(async () => {
    const handle = viewerRef.current;
    const pdfDocument = handle?.document as PDFDocumentProxy | undefined;
    const scroller = handle?.element?.querySelector<HTMLElement>('.k-pdf-viewer-canvas');
    if (!pdfDocument || !scroller) return;

    // Page 1 stands for the document, as it does in Kendo's own fit. The
    // viewport accounts for the page's /Rotate, so a landscape page measures
    // as landscape.
    const page = await pdfDocument.getPage(1);
    const fitted = fitWidthZoom(
      scroller.clientWidth,
      page.getViewport({ scale: 1 }).width,
      isMobile ? Infinity : DESKTOP_MAX_FIT_ZOOM,
    );
    if (fitted === null) return;
    zoomedByHand.current = false;
    setZoom(fitted);
  }, [isMobile]);

  /**
   * Refit when the viewer changes width — turning a phone or tablet, resizing
   * a window, crossing into the other layout. Width only: mobile browsers
   * resize the viewport *height* whenever the address bar slides in or out,
   * and refitting on that would fight the user's scrolling. Skipped once the
   * reader has zoomed by hand. Re-armed per file, since the remount replaces
   * the element.
   */
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const scroller = viewerRef.current?.element?.querySelector<HTMLElement>('.k-pdf-viewer-canvas');
    if (!scroller) return;

    let lastWidth = scroller.clientWidth;
    const observer = new ResizeObserver(() => {
      if (scroller.clientWidth === lastWidth) return;
      lastWidth = scroller.clientWidth;
      if (!zoomedByHand.current) void fitToWidth();
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [filePath, fitToWidth]);

  /**
   * ── Two-way page sync ──────────────────────────────────────────────────
   *
   * `currentPage` lives in the parent rather than here, because the thumbnail
   * sidebar needs it too. That makes it two-way bound, and two different
   * things can change it:
   *
   *   scroll / Kendo's pager  →  Kendo tells us   →  the parent must update
   *   a thumbnail click       →  the parent tells us  →  we must scroll
   *
   * Both arrive as the same `currentPage` prop. With no way to tell them
   * apart, the first would trigger the second:
   *
   *   1. you scroll to page 3     → Kendo fires onPageChange(3)
   *   2. → parent setCurrentPage(3)
   *   3. → re-render, the currentPage prop is now 3
   *   4. → the effect below fires → scrollToPage(element, 2)
   *   5. → the viewer yanks back to the top of page 3, mid-scroll
   *
   * Step 4 is the bug. The parent was only echoing back what the viewer
   * itself had just reported, but the effect cannot tell that apart from a
   * genuine thumbnail click.
   *
   * This ref supplies the missing fact: which page the viewer is *already*
   * showing. Both directions write it before acting — handlePageChange below
   * when the change came from Kendo, the effect when it came from outside —
   * so the guard at the top of the effect can read "currentPage already
   * matches" as "this is my own echo, do nothing". A thumbnail click does not
   * match, falls through, and scrolls.
   *
   * A ref and not state, deliberately: writing it must not cause a render,
   * and the effect must read it synchronously on the very next render, which
   * batched state would not give.
   */
  const viewerPageRef = useRef(currentPage);

  useEffect(() => {
    // The echo check. See the note above — this is what keeps a page change
    // the viewer reported from being scrolled back at the user.
    if (currentPage === viewerPageRef.current) return;

    // Null until React commits the ref, and again before a document loads.
    const element = viewerRef.current?.element;
    if (!element) return;

    viewerPageRef.current = currentPage;
    // Kendo's scrollToPage takes a zero-based page index, while its
    // onPageChange event reports one-based page numbers.
    scrollToPage(element, currentPage - 1);
  }, [currentPage]);

  const handlePageChange = useCallback(
    (event: PageEvent) => {
      // Record it before reporting upward, so that when the parent's state
      // change comes back down the effect's guard already matches.
      viewerPageRef.current = event.page;
      onPageChange(event.page);
    },
    [onPageChange],
  );

  /** Fires once per document, when Kendo has finished parsing it. */
  const handleLoad = useCallback(() => {
    // Reported up so the sidebar and details panel know the total. Guarded,
    // because a failed load leaves `pages` empty and passing 0 up would look
    // like a real answer rather than an absent one.
    const totalPages = viewerRef.current?.pages?.length ?? 0;
    if (totalPages > 0) onLoadSuccess(totalPages);

    // The pdf.js document Kendo just parsed. The thumbnail rail draws its
    // pages from it and the attachment listing reads its bytes, so neither has
    // to download the file again. Kendo types it `any`; it is PDF.js's
    // PDFDocumentProxy ("The PDF.js document loaded in the PDF Viewer").
    onDocumentLoad((viewerRef.current?.document as PDFDocumentProxy | undefined) ?? null);

    // Only now are both sizes known: the page from the parsed document, the
    // viewer from the laid-out element. A new document is always fitted, even
    // if the last one was zoomed by hand.
    void fitToWidth();
  }, [onLoadSuccess, onDocumentLoad, fitToWidth]);

  const handleError = useCallback((event: ErrorEvent) => {
    console.error('KendoReact PDF Viewer failed to load the document:', event.error);
  }, []);

  /**
   * Appends the attachments button to Kendo's own toolbar.
   *
   * `tools` only accepts Kendo's nine built-in names, so a custom tool cannot
   * go in that way. onRenderToolbar hands over the rendered toolbar element
   * instead, and cloning it with one extra child puts our button inside the
   * real bar rather than next to it.
   *
   * Kendo's roving tabindex only governs children matching its internal
   * `buttons` selectors, which ours does not match — so the button keeps its
   * natural tab stop instead of being skipped.
   */
  const renderToolbar = useCallback(
    (defaultRendering: ReactElement<{ children?: ReactNode }>) =>
      cloneElement(
        defaultRendering,
        undefined,
        ...Children.toArray(defaultRendering.props.children),
        <ToolbarAttachments key="attachments" attachments={attachments} />,
      ),
    [attachments],
  );

  return (
    <div className="kendo-pdf-viewer">
      <PDFViewer
        // Remounting on file change resets zoom/scroll for the new document,
        // which is what we want when the user picks a different case.
        key={filePath}
        ref={viewerRef}
        url={filePath}
        saveFileName={fileName}
        tools={isMobile ? MOBILE_TOOLS : DESKTOP_TOOLS}
        // The zoom is controlled so it can be fitted to the viewer. Kendo's own
        // zoom controls still work: each change comes back through onZoom and
        // is fed straight back in.
        zoom={zoom}
        minZoom={MIN_ZOOM}
        onZoom={handleZoom}
        onLoad={handleLoad}
        onPageChange={handlePageChange}
        onError={handleError}
        onRenderToolbar={placement === 'toolbar' ? renderToolbar : undefined}
        style={{ height: '100%' }}
      />

      {placement === 'bottom' && <BottomBarAttachments attachments={attachments} />}
    </div>
  );
}
