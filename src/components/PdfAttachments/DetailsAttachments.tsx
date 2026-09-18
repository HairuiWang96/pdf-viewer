import type { PdfAttachment } from './attachments';
import AttachmentControl from './AttachmentControl';
import './DetailsAttachments.css';

interface DetailsAttachmentsProps {
  attachments: PdfAttachment[];
}

/**
 * Placement 3 of 3 — a section inside the Document Details panel.
 *
 * The filed-away option: attachments become another property of the document,
 * sitting with Title, File Size and Tags rather than with the viewer controls.
 * Always expanded, because the panel is somewhere you go on purpose — a
 * disclosure toggle inside a drawer you deliberately opened is a second lock
 * on the same door.
 *
 * Conceptually the tidiest of the three: an embedded file *is* metadata about
 * the document. The cost is discovery, and it is the steepest of the three —
 * on mobile the panel is closed by default, so the indicator is two taps and
 * a scroll away, and nothing anywhere hints that it is worth the trip. Best
 * read as a complement to a louder placement rather than as the only one.
 */
export default function DetailsAttachments({ attachments }: DetailsAttachmentsProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="details-section">
      <h3>
        Attachments
        <span className="details-attachments-count">{attachments.length}</span>
      </h3>

      <ul className="details-attachments-list">
        {attachments.map((att) => (
          <li key={att.filename} className="details-attachment">
            <span className="details-attachment-name" title={att.filename}>
              {att.filename}
            </span>
            <AttachmentControl attachment={att} className="details-attachment-action" />
          </li>
        ))}
      </ul>
    </div>
  );
}
