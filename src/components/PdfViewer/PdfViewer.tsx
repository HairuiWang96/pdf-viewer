import { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import PageNavigation from '../PageNavigation';
import './PdfViewer.css';

// The legacy worker, to match the legacy API that vite.config.ts aliases
// 'pdfjs-dist' onto. Both halves have to come from the same build: the modern
// one omits the Map.prototype.getOrInsertComputed polyfill that Safari needs,
// and PDF.js refuses to load a document if API and worker versions disagree.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  filePath: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  onLoadSuccess: (totalPages: number) => void;
  isMobile: boolean;
}

/**
 * Page width strategy:
 * - Desktop/tablet: percentage of the container width (85%).
 * - Mobile: measures the container and subtracts padding so the
 *   PDF fits the screen without overflow.
 */
const DESKTOP_WIDTH_PERCENT = 0.85;
const MOBILE_PADDING = 16; // 8px padding on each side

export default function PdfViewer({
  filePath,
  currentPage,
  onPageChange,
  onLoadSuccess,
  isMobile,
}: PdfViewerProps) {
  const [totalPages, setTotalPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // The page the viewer is actually showing. Without it the two effects below
  // fight each other: scrolling reports a new page, the parent's state changes,
  // and the scroll-to effect would yank the document back.
  const visiblePageRef = useRef(currentPage);

  // Timestamp until which scroll reports are ignored, so the jump triggered by
  // a thumbnail click isn't mistaken for the user scrolling.
  const suppressSyncUntil = useRef(0);

  useEffect(() => {
    const updateWidth = () => {
      if (!canvasRef.current) return;
      const containerWidth = canvasRef.current.clientWidth;

      if (isMobile) {
        setPageWidth(containerWidth - MOBILE_PADDING);
      } else {
        setPageWidth(containerWidth * DESKTOP_WIDTH_PERCENT);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [isMobile]);

  const handleLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      // A different document — drop the previous one's page elements and
      // start back at the top.
      pageRefs.current = [];
      visiblePageRef.current = 1;
      setTotalPages(numPages);
      onLoadSuccess(numPages);
    },
    [onLoadSuccess],
  );

  // Report whichever page occupies most of the viewport, so the page counter
  // and the thumbnail highlight follow the user's scrolling.
  useEffect(() => {
    const root = canvasRef.current;
    if (!root || totalPages === 0) return;

    const ratios = new Map<number, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          ratios.set(page, entry.intersectionRatio);
        }

        if (Date.now() < suppressSyncUntil.current) return;

        let bestPage = visiblePageRef.current;
        let bestRatio = 0;
        for (const [page, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPage = page;
          }
        }

        if (bestRatio > 0 && bestPage !== visiblePageRef.current) {
          visiblePageRef.current = bestPage;
          onPageChange(bestPage);
        }
      },
      { root, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    );

    const elements = pageRefs.current.filter((el): el is HTMLDivElement => el !== null);
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [totalPages, onPageChange]);

  // Jump to a page picked from the thumbnails or the pagination bar.
  useEffect(() => {
    if (currentPage === visiblePageRef.current) return;

    const element = pageRefs.current[currentPage - 1];
    if (!element) return;

    visiblePageRef.current = currentPage;
    // Instant, not smooth: a smooth scroll travels through every page in
    // between and each one would be reported back as the visible page.
    suppressSyncUntil.current = Date.now() + 400;
    element.scrollIntoView({ block: 'start' });
  }, [currentPage]);

  return (
    <div className="pdf-viewer">
      <div className="pdf-canvas" ref={canvasRef}>
        {pageWidth > 0 && (
          // Document renders a wrapper div of its own, so it has to carry the
          // layout class — styling .pdf-canvas would only ever see this one
          // element as its child, never the individual pages.
          <Document
            className="pdf-pages"
            file={filePath}
            onLoadSuccess={handleLoadSuccess}
            loading={<div className="pdf-loading">Loading PDF...</div>}
            error={<div className="pdf-error">Failed to load PDF.</div>}
          >
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <div
                key={page}
                className="pdf-page"
                data-page={page}
                ref={(element) => {
                  pageRefs.current[page - 1] = element;
                }}
              >
                <Page
                  pageNumber={page}
                  width={pageWidth}
                  loading={<div className="pdf-loading">Loading page...</div>}
                />
              </div>
            ))}
          </Document>
        )}
      </div>

      {totalPages > 0 && (
        <PageNavigation
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}
