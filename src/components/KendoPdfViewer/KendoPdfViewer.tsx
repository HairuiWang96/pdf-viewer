import { Children, cloneElement, useCallback, useEffect, useRef } from 'react';
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
import type { AttachmentBytes, AttachmentPlacement, PdfAttachment } from '../PdfAttachments';
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
  onDocumentLoad: (document: AttachmentBytes | null) => void;
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

    // The pdf.js document Kendo just parsed. Its getData() returns the bytes
    // already downloaded, which is what saves the page a second request for a
    // file it is looking at.
    onDocumentLoad((viewerRef.current?.document as AttachmentBytes | undefined) ?? null);
  }, [onLoadSuccess, onDocumentLoad]);

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
        defaultZoom={isMobile ? 0.75 : 1}
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
