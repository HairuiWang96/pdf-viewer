import { useCallback, useEffect, useRef, useState } from 'react';
import { PDFViewer, scrollToPage } from '@progress/kendo-react-all';
import type {
  PDFViewerHandle,
  PDFViewerTool,
  PageEvent,
  ErrorEvent,
} from '@progress/kendo-react-all';
import '@progress/kendo-theme-default/dist/all.css';
import { toAttachments } from './attachments';
import type { PdfAttachment, RawAttachment } from './attachments';
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
  const [attachments, setAttachments] = useState<PdfAttachment[]>([]);
  // Starts closed on every document — the viewer remounts on file change
  // (see `key={filePath}` below), so this resets itself.
  const [isAttachmentsOpen, setIsAttachmentsOpen] = useState(false);

  // Tracks the page the viewer itself is showing. Without this, scrolling the
  // viewer raises onPageChange -> parent state changes -> the effect below
  // would scroll the viewer again, fighting the user's scroll.
  const viewerPageRef = useRef(currentPage);

  // Mirrored into a ref so the unmount cleanup below can see the current list.
  // A cleanup with an empty dependency array closes over the value from the
  // first render, which is the empty array — it would revoke nothing and the
  // blob URLs would leak for the life of the tab. Written in an effect rather
  // than during render, since a render can be discarded before it commits.
  const attachmentsRef = useRef<PdfAttachment[]>([]);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // The viewer remounts on file change (see `key={filePath}` below), so this
  // only needs to revoke on unmount, not on every document switch.
  useEffect(() => {
    return () => attachmentsRef.current.forEach((att) => URL.revokeObjectURL(att.url));
  }, []);

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

    // Attachments (e.g. embedded audio) aren't part of the page content, so
    // Kendo never renders them — but it does expose the pdf.js document it
    // already parsed internally, so we can pull them out from that directly
    // instead of loading the file a second time.
    const pdfDocument = viewerRef.current?.document;
    pdfDocument
      ?.getAttachments()
      .then((raw: Record<string, RawAttachment> | undefined) => {
        setAttachments(toAttachments(raw));
      })
      .catch((error: unknown) => {
        // A malformed or unusual file can reject here. The document itself
        // still renders, so log it and leave the panel hidden rather than
        // letting an unhandled rejection take the view down.
        console.error('Could not read attachments from the document:', error);
      });
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

      {attachments.length > 0 && (
        <div className="pdf-attachments">
          {/* Collapsed by default: most documents carry no attachments, and a
              row of players per file crowds the viewer. The count is on the
              button so their presence is still obvious without expanding. */}
          <button
            type="button"
            className="pdf-attachments-toggle"
            aria-expanded={isAttachmentsOpen}
            aria-controls="pdf-attachments-list"
            onClick={() => setIsAttachmentsOpen((open) => !open)}
          >
            <span className="pdf-attachments-caret" aria-hidden="true" />
            Attachments
            <span className="pdf-attachments-count">{attachments.length}</span>
          </button>

          {isAttachmentsOpen && (
            <ul className="pdf-attachments-list" id="pdf-attachments-list">
              {attachments.map((att) => (
                <li key={att.filename} className="pdf-attachment">
                  <span className="pdf-attachment-name">{att.filename}</span>
                  {att.mimeType?.startsWith('audio/') ? (
                    <audio controls src={att.url} />
                  ) : (
                    <a className="pdf-attachment-download" href={att.url} download={att.filename}>
                      Download
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
