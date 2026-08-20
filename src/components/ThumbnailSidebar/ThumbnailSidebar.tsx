import { Document, Page } from 'react-pdf';
import { THUMBNAIL_WIDTH } from '../../constants';
import './ThumbnailSidebar.css';

interface ThumbnailSidebarProps {
  filePath: string;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function ThumbnailSidebar({
  filePath,
  currentPage,
  totalPages,
  onPageChange,
}: ThumbnailSidebarProps) {
  if (totalPages === 0) return null;

  return (
    <div className="thumbnail-sidebar">
      <Document file={filePath}>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            className={`thumbnail-item ${page === currentPage ? 'active' : ''}`}
            onClick={() => onPageChange(page)}
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
    </div>
  );
}
