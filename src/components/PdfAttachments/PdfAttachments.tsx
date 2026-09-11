import { useState } from 'react';
import { useAttachments } from './useAttachments';
import type { AttachmentSource } from './useAttachments';
import './PdfAttachments.css';

interface PdfAttachmentsProps {
  /** The parsed PDF document, or null until one has loaded. */
  source: AttachmentSource | null;
}

/**
 * The embedded-file panel that sits under a PDF viewer.
 *
 * Attachments are not page content, so no viewer renders them — this reads
 * them off the parsed document and gives audio its own player and everything
 * else a download link. It owns the whole concern (reading, blob lifecycle,
 * UI), so a viewer only has to hand over the document it already parsed.
 *
 * Renders nothing at all when the document carries no attachments, which is
 * the common case.
 */
export default function PdfAttachments({ source }: PdfAttachmentsProps) {
  const attachments = useAttachments(source);

  // Starts closed for every document: the panel remounts (or `source` changes)
  // on file change, so this resets itself.
  const [isOpen, setIsOpen] = useState(false);

  if (attachments.length === 0) return null;

  return (
    <div className="pdf-attachments">
      {/* Collapsed by default: most documents carry no attachments, and a
          row of players per file crowds the viewer. The count is on the
          button so their presence is still obvious without expanding. */}
      <button
        type="button"
        className="pdf-attachments-toggle"
        aria-expanded={isOpen}
        aria-controls="pdf-attachments-list"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="pdf-attachments-caret" aria-hidden="true" />
        Attachments
        <span className="pdf-attachments-count">{attachments.length}</span>
      </button>

      {isOpen && (
        <ul className="pdf-attachments-list" id="pdf-attachments-list">
          {attachments.map((att) => (
            <li key={att.filename} className="pdf-attachment">
              <span className="pdf-attachment-name">{att.filename}</span>
              {att.mimeType?.startsWith('audio/') ? (
                <audio controls src={att.url} />
              ) : (
                <a className="pdf-attachment-download" href={att.url} download={att.filename}>
                  Download
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
