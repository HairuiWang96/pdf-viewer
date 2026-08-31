import { useCallback, useEffect, useRef } from 'react';
import { PDFViewer, scrollToPage } from '@progress/kendo-react-pdf-viewer';
import type {
  PDFViewerHandle,
  PDFViewerTool,
  PageEvent,
  ErrorEvent,
} from '@progress/kendo-react-pdf-viewer';
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

/** Toolbar tools. Mobile drops search/open/print to fit the narrow bar. */
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

const MOBILE_TOOLS: PDFViewerTool[] = ['pager', 'spacer', 'zoomInOut', 'download'];

export default function KendoPdfViewer({
  filePath,
  fileName,
  currentPage,
  onPageChange,
  onLoadSuccess,
  isMobile,
}: KendoPdfViewerProps) {
  const viewerRef = useRef<PDFViewerHandle | null>(null);

  // Tracks the page the viewer itself is showing. Without this, scrolling the
  // viewer raises onPageChange -> parent state changes -> the effect below
  // would scroll the viewer again, fighting the user's scroll.
  const viewerPageRef = useRef(currentPage);

  useEffect(() => {
    if (currentPage === viewerPageRef.current) return;

    const element = viewerRef.current?.element;
    if (!element) return;

    viewerPageRef.current = currentPage;
    // Kendo's scrollToPage takes a zero-based page index, while its
    // onPageChange event reports one-based page numbers.
    scrollToPage(element, currentPage - 1);
  }, [currentPage]);

  const handlePageChange = useCallback(
    (event: PageEvent) => {
      viewerPageRef.current = event.page;
      onPageChange(event.page);
    },
    [onPageChange],
  );

  const handleLoad = useCallback(() => {
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
