import type { PdfMetadata } from '../../types';
import './PdfDetails.css';

interface PdfDetailsProps {
  metadata: PdfMetadata;
}

export default function PdfDetails({ metadata }: PdfDetailsProps) {
  return (
    <aside className="pdf-details">
      <h2 className="details-title">Document Details</h2>

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
          <dd>{metadata.totalPages}</dd>
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
    </aside>
  );
}
