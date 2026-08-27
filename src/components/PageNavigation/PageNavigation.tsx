import './PageNavigation.css';

interface PageNavigationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function PageNavigation({
  currentPage,
  totalPages,
  onPageChange,
}: PageNavigationProps) {
  return (
    <nav className="page-navigation" aria-label="Page navigation">
      <button
        className="nav-btn"
        disabled={currentPage <= 1}
        aria-label="Previous page"
        onClick={() => onPageChange(currentPage - 1)}
      >
        ← Prev
      </button>

      <div className="page-indicators" role="group" aria-label="Page numbers">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            className={`page-dot ${page === currentPage ? 'active' : ''}`}
            aria-label={`Go to page ${page}`}
            aria-current={page === currentPage ? 'page' : undefined}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        ))}
      </div>

      <span className="page-info" aria-live="polite" aria-atomic="true">
        Page {currentPage} of {totalPages}
      </span>

      <button
        className="nav-btn"
        disabled={currentPage >= totalPages}
        aria-label="Next page"
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next →
      </button>
    </nav>
  );
}
