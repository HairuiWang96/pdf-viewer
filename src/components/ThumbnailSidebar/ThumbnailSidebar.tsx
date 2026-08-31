import { THUMBNAIL_WIDTH } from '../../constants';
import { usePdfThumbnails } from '../../hooks';
import './ThumbnailSidebar.css';

interface ThumbnailSidebarProps {
  filePath: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export default function ThumbnailSidebar({
  filePath,
  currentPage,
  onPageChange,
  isMobile,
  isOpen,
  onClose,
}: ThumbnailSidebarProps) {
  // Page count comes from the thumbnails themselves — one per page — so the
  // rail no longer waits on the main viewer to report a total.
  const thumbnails = usePdfThumbnails(filePath, THUMBNAIL_WIDTH);

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
