import { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import PageNavigation from '../PageNavigation';
import './PdfViewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
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
      setTotalPages(numPages);
      onLoadSuccess(numPages);
    },
    [onLoadSuccess],
  );

  return (
    <div className="pdf-viewer">
      <div className="pdf-canvas" ref={canvasRef}>
        {pageWidth > 0 && (
          <Document
            file={filePath}
            onLoadSuccess={handleLoadSuccess}
            loading={<div className="pdf-loading">Loading PDF...</div>}
            error={<div className="pdf-error">Failed to load PDF.</div>}
          >
            <Page
              pageNumber={currentPage}
              width={pageWidth}
              loading={<div className="pdf-loading">Loading page...</div>}
            />
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
