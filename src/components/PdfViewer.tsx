import { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import PageNavigation from './PageNavigation';
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
}

export default function PdfViewer({
  filePath,
  currentPage,
  onPageChange,
  onLoadSuccess,
}: PdfViewerProps) {
  const [totalPages, setTotalPages] = useState(0);

  const handleLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setTotalPages(numPages);
      onLoadSuccess(numPages);
    },
    [onLoadSuccess],
  );

  return (
    <div className="pdf-viewer">
      <div className="pdf-canvas">
        <Document
          file={filePath}
          onLoadSuccess={handleLoadSuccess}
          loading={<div className="pdf-loading">Loading PDF...</div>}
          error={<div className="pdf-error">Failed to load PDF.</div>}
        >
          <Page
            pageNumber={currentPage}
            width={700}
            loading={<div className="pdf-loading">Loading page...</div>}
          />
        </Document>
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
