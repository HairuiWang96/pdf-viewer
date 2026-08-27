import { Document, Page } from 'react-pdf';
import { THUMBNAIL_WIDTH } from '../../constants';
import './ThumbnailSidebar.css';

interface ThumbnailSidebarProps {
  filePath: string;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export default function ThumbnailSidebar({
  filePath,
  currentPage,
  totalPages,
  onPageChange,
  isMobile,
  isOpen,
  onClose,
}: ThumbnailSidebarProps) {
  if (totalPages === 0) return null;

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
            {'\u2715'}
          </button>
        </div>
      )}

      {/* The Document component must wrap all Page components, but we need
          the grid to be the direct parent of the buttons for CSS grid layout.
          So Document wraps the grid, and the grid contains the buttons. */}
      <Document file={filePath} className="thumbnail-grid">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            className={`thumbnail-item ${page === currentPage ? 'active' : ''}`}
            aria-label={`Page ${page}`}
            aria-current={page === currentPage ? 'page' : undefined}
            onClick={() => handlePageSelect(page)}
          >
            <Page
              pageNumber={page}
              width={THUMBNAIL_WIDTH}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
            <span className="thumbnail-label">{page}</span>
          </button>
        ))}
      </Document>
    </nav>
  );
}
