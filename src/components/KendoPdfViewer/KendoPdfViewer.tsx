import { useCallback, useEffect, useRef, useState } from 'react';
import { PDFViewer, scrollToPage } from '@progress/kendo-react-all';
import type {
  PDFViewerHandle,
  PDFViewerTool,
  PageEvent,
  ErrorEvent,
} from '@progress/kendo-react-all';
import '@progress/kendo-theme-default/dist/all.css';
import PdfAttachments from '../PdfAttachments';
import type { AttachmentSource } from '../PdfAttachments';
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
 *
 * Embedded attachments are not this component's concern: it just hands the
 * parsed document to PdfAttachments, which renders itself or nothing.
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

  // Handed to PdfAttachments, which owns everything else about them.
  const [pdfDocument, setPdfDocument] = useState<AttachmentSource | null>(null);

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

    // Kendo exposes the pdf.js document it parsed internally. Passing it down
    // lets PdfAttachments read the embedded files from the document already in
    // memory instead of fetching the PDF a second time.
    setPdfDocument((viewerRef.current?.document as AttachmentSource | undefined) ?? null);
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

      <PdfAttachments source={pdfDocument} />
    </div>
  );
}
