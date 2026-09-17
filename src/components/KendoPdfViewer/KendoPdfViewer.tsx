import { useCallback, useEffect, useRef } from 'react';
import { PDFViewer, scrollToPage } from '@progress/kendo-react-all';
import type {
  PDFViewerHandle,
  PDFViewerTool,
  PageEvent,
  ErrorEvent,
} from '@progress/kendo-react-all';
import '@progress/kendo-theme-default/dist/all.css';
import './KendoPdfViewer.css';

interface KendoPdfViewerProps {
  filePath: string;
  fileName: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  onLoadSuccess: (totalPages: number) => void;
  isMobile: boolean;
}


/**
 * KendoReact PDF Viewer (commercial component — see README for licensing).
 *
 * Unlike the react-pdf viewer, this renders ALL pages in one scrolling
 * container and ships its own toolbar (pager, zoom, search, download,
 * print). So there is no separate PageNavigation bar here — page changes
 * come from the toolbar pager or from scrolling, and are pushed back up
 * so the thumbnail sidebar stays in sync.
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
  isMobile,
}: KendoPdfViewerProps) {
  const viewerRef = useRef<PDFViewerHandle | null>(null);

  /**
   * ── Two-way page sync: the sticky note ─────────────────────────────────
   *
   * In one line: this ref is a sticky note where the viewer writes down "I am
   * currently showing page N", so it can tell a real instruction apart from
   * its own words coming back at it.
   *
   * The page number is not stored here. It lives in the parent, because the
   * thumbnail sidebar needs it too — so this component never simply *knows*
   * the page, it gets *told*. Two things can do the telling:
   *
   *   You click a thumbnail
   *     parent → viewer:  "The page is 7. Go there."
   *     viewer:           scrolls to page 7.                  correct
   *
   *   You scroll the PDF yourself
   *     viewer → parent:  "I'm on page 3 now."
   *     parent → viewer:  "The page is 3. Go there."
   *     viewer:           scrolls to page 3.                  wrong
   *
   * The second is the bug. You were already on page 3 — you put yourself
   * there by scrolling. "Going" there yanks you back to the top of the page
   * mid-scroll, which reads as the viewer fighting you.
   *
   * And here is the trap: both messages from the parent are *identical*.
   *
   *     "The page is 7."   ← a real instruction
   *     "The page is 3."   ← your own words echoing back
   *
   * Same prop, same shape. Nothing in the message says which is which.
   *
   * Hence the note. When a message arrives, check the note first:
   *
   *     message says 3, note says 3  →  "that's just me"  →  ignore
   *     message says 7, note says 3  →  "that's new"      →  scroll
   *
   * That single comparison is the whole mechanism.
   *
   * A ref rather than state, for two plain reasons. Writing to it must not
   * redraw anything — it is a private note about where the viewer is, not
   * something shown on screen. And it must be readable *immediately*: state
   * updates are delayed a beat, and the note has to be accurate before the
   * parent's reply arrives.
   */
  const viewerPageRef = useRef(currentPage);

  useEffect(() => {
    // Read the note. Same page? Then this is our own echo — sit still.
    if (currentPage === viewerPageRef.current) return;

    // Null until React commits the ref, and again before a document loads.
    const element = viewerRef.current?.element;
    if (!element) return;

    // A real instruction: update the note, then actually move.
    viewerPageRef.current = currentPage;
    // Kendo's scrollToPage takes a zero-based page index, while its
    // onPageChange event reports one-based page numbers.
    scrollToPage(element, currentPage - 1);
  }, [currentPage]);

  const handlePageChange = useCallback(
    (event: PageEvent) => {
      // Write the note BEFORE telling the parent. The order is load-bearing:
      // the parent's reply comes back a moment later, and the note has to
      // already say 3 for that reply to be recognised as an echo. Write it
      // afterwards and the reply arrives first, and the viewer scrolls at the
      // user anyway.
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
  }, [onLoadSuccess]);

  const handleError = useCallback((event: ErrorEvent) => {
    console.error('KendoReact PDF Viewer failed to load the document:', event.error);
  }, []);

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
        defaultZoom={isMobile ? 0.75 : 1}
        onLoad={handleLoad}
        onPageChange={handlePageChange}
        onError={handleError}
        style={{ height: '100%' }}
      />
    </div>
  );
}
