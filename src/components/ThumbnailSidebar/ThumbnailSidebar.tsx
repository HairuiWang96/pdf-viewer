import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { THUMBNAIL_WIDTH } from '../../constants';
import { usePdfThumbnails } from '../../hooks';
import './ThumbnailSidebar.css';

interface ThumbnailSidebarProps {
  /** The viewer's loaded document, or null until it has one. */
  pdfDocument: PDFDocumentProxy | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export default function ThumbnailSidebar({
  pdfDocument,
  currentPage,
  onPageChange,
  isMobile,
  isOpen,
  onClose,
}: ThumbnailSidebarProps) {
  // Page count comes from the thumbnails themselves — one per page. They are
  // drawn from the viewer's own document, so the file is not downloaded twice.
  const thumbnails = usePdfThumbnails(pdfDocument, THUMBNAIL_WIDTH);

  if (thumbnails.length === 0) return null;

  // On mobile, tapping a thumbnail should also close the panel
  // so the user sees the selected page in the viewer.
  const handlePageSelect = (page: number) => {
    onPageChange(page);
    if (isMobile) onClose();
  };

  return (
    <nav
      className={`thumbnail-sidebar ${isMobile ? 'thumbnail-sidebar--mobile' : ''} ${isOpen ? 'thumbnail-sidebar--open' : ''}`}
      aria-label="Page thumbnails"
      role={isMobile ? 'dialog' : undefined}
      aria-modal={isMobile && isOpen ? true : undefined}
    >
      {isMobile && (
        <div className="thumbnail-header">
          <h2 className="thumbnail-title">Pages</h2>
          <button className="thumbnail-close-btn" onClick={onClose} aria-label="Close thumbnails">
            {'✕'}
          </button>
        </div>
      )}

      <div className="thumbnail-grid">
        {thumbnails.map((src, index) => {
          const page = index + 1;

          return (
            <button
              key={page}
              className={`thumbnail-item ${page === currentPage ? 'active' : ''}`}
              aria-label={`Page ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
              onClick={() => handlePageSelect(page)}
            >
              <img src={src} alt="" width={THUMBNAIL_WIDTH} />
              <span className="thumbnail-label">{page}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
