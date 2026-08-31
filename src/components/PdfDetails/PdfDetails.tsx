import type { PdfMetadata } from '../../types';
import CaseSelector from '../CaseSelector';
import './PdfDetails.css';

interface PdfDetailsProps {
  metadata: PdfMetadata | null;
  currentPage: number;
  showStamp: boolean;
  onToggleStamp: (stamped: boolean) => void;
  downloadUrl: string;
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
  /* Case selection props — only needed when there are multiple cases */
  allCases: PdfMetadata[];
  hasMultipleCases: boolean;
  selectedCaseId: string | null;
  onSelectCase: (caseId: string) => void;
}

export default function PdfDetails({
  metadata,
  currentPage,
  showStamp,
  onToggleStamp,
  downloadUrl,
  isMobile,
  isOpen,
  onClose,
  allCases,
  hasMultipleCases,
  selectedCaseId,
  onSelectCase,
}: PdfDetailsProps) {
  return (
      <aside
        className={`pdf-details ${isMobile ? 'pdf-details--mobile' : ''} ${isOpen ? 'pdf-details--open' : ''}`}
        role={isMobile ? 'dialog' : undefined}
        aria-modal={isMobile && isOpen ? true : undefined}
        aria-label={isMobile ? 'Document Details' : undefined}
      >
        <div className="details-header">
          <h2 className="details-title">Document Details</h2>
          {isMobile && (
            <button className="details-close-btn" onClick={onClose} aria-label="Close details">
              {/* \u2715 = ✕ close icon */}
              {'\u2715'}
            </button>
          )}
        </div>

      {/* Multiple cases → show dropdown so user can pick.
          Single case → just display the case number as static text. */}
      {hasMultipleCases ? (
        <CaseSelector
          cases={allCases}
          selectedCaseId={selectedCaseId}
          onSelectCase={onSelectCase}
        />
      ) : (
        metadata && (
          <div className="details-section">
            <h3>Case Number</h3>
            <p className="case-number-static">{metadata.caseNumber}</p>
          </div>
        )
      )}

      {/* Detail sections stay hidden until a case is selected.
          Before selection, only the CaseSelector dropdown is visible. */}
      {metadata && (
        <>
        <div className="details-section">
          <h3>General</h3>
          <dl className="details-list">
            <dt>Title</dt>
            <dd>{metadata.title}</dd>
            <dt>Author</dt>
            <dd>{metadata.author}</dd>
            <dt>Category</dt>
            <dd>{metadata.category}</dd>
            <dt>Status</dt>
            <dd>
              <span className="status-badge">{metadata.status}</span>
            </dd>
          </dl>
        </div>

        <div className="details-section">
          <h3>Description</h3>
          <p className="details-description">{metadata.description}</p>
        </div>

        <div className="details-section">
          <h3>File Info</h3>
          <dl className="details-list">
            <dt>File Name</dt>
            <dd>{metadata.fileName}</dd>
            <dt>File Size</dt>
            <dd>{metadata.fileSize}</dd>
            <dt>Pages</dt>
            <dd>
              {currentPage} / {metadata.totalPages}
            </dd>
            <dt>Language</dt>
            <dd>{metadata.language}</dd>
          </dl>
        </div>

        <div className="details-section">
          <h3>Dates</h3>
          <dl className="details-list">
            <dt>Created</dt>
            <dd>{metadata.createdDate}</dd>
            <dt>Modified</dt>
            <dd>{metadata.lastModified}</dd>
          </dl>
        </div>

        <div className="details-section">
          <h3>Tags</h3>
          <div className="tags-container">
            {metadata.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="details-section">
          <fieldset className="stamp-toggle">
            <legend className="stamp-legend">Download</legend>
            <label className="radio-label">
              <input
                type="radio"
                name="stamp"
                checked={!showStamp}
                onChange={() => onToggleStamp(false)}
              />
              Without stamp
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="stamp"
                checked={showStamp}
                onChange={() => onToggleStamp(true)}
              />
              With stamp
            </label>
          </fieldset>
          <a className="download-btn" href={downloadUrl} download={metadata.fileName}>
            Download PDF
          </a>
        </div>
        </>
      )}
    </aside>
  );
}
