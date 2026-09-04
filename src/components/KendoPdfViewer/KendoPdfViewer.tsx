import { useCallback, useEffect, useRef, useState } from 'react';
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

// pdf.js attachments carry raw bytes and a filename, no MIME type — guess one
// from the extension so the browser knows how to play/handle the Blob.
const AUDIO_MIME_TYPES: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
};

function guessAudioMimeType(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? (AUDIO_MIME_TYPES[ext] ?? null) : null;
}

interface PdfAttachment {
  filename: string;
  url: string;
  mimeType: string | null;
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

  // Tracks the page the viewer itself is showing. Without this, scrolling the
  // viewer raises onPageChange -> parent state changes -> the effect below
  // would scroll the viewer again, fighting the user's scroll.
  const viewerPageRef = useRef(currentPage);

  // The viewer remounts on file change (see `key={filePath}` below), so this
  // only needs to revoke on unmount, not on every document switch.
  useEffect(() => {
    return () => attachments.forEach((att) => URL.revokeObjectURL(att.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    pdfDocument?.getAttachments().then((raw: Record<string, { filename: string; content: Uint8Array }> | undefined) => {
      const found = Object.values(raw ?? {});
      const next = found.map((att) => {
        const mimeType = guessAudioMimeType(att.filename);
        const blob = new Blob([new Uint8Array(att.content)], { type: mimeType ?? 'application/octet-stream' });
        return { filename: att.filename, url: URL.createObjectURL(blob), mimeType };
      });
      setAttachments(next);
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
          <span className="pdf-attachments-label">Attachments</span>
          {attachments.map((att) =>
            att.mimeType?.startsWith('audio/') ? (
              <div key={att.filename} className="pdf-attachment pdf-attachment-audio">
                <span className="pdf-attachment-name">{att.filename}</span>
                <audio controls src={att.url} />
              </div>
            ) : (
              <a key={att.filename} className="pdf-attachment" href={att.url} download={att.filename}>
                {att.filename}
              </a>
            ),
          )}
        </div>
      )}
    </div>
  );
}
