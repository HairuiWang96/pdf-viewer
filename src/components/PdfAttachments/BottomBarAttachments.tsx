import { useState } from 'react';
import { attachmentLabel } from './attachments';
import type { PdfAttachment } from './attachments';
import AttachmentControl from './AttachmentControl';
import './BottomBarAttachments.css';

interface BottomBarAttachmentsProps {
  attachments: PdfAttachment[];
}

/**
 * Placement 1 of 3 — a persistent bar pinned under the document.
 *
 * The ambient option: always on screen whenever the document has attachments,
 * costing a strip of vertical space to buy the guarantee that nobody has to go
 * looking. Expands in place, pushing nothing aside.
 *
 * Reads as part of the document rather than part of the tooling, which suits
 * attachments — they belong to the file, not to the viewer. The cost is that a
 * permanent bar is also permanently in the way, and on a phone it has to be
 * loud enough to not be mistaken for browser chrome.
 *
 * See placement.ts for the alternatives. Renders nothing when the document has
 * no attachments, which is the common case.
 */
export default function BottomBarAttachments({ attachments }: BottomBarAttachmentsProps) {
  // Starts closed for every document: the page clears attachments on file
  // change, so this resets itself.
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
        {/* Mobile only (see the CSS). A phone shows this bar as a thin strip
            at the very bottom edge, where it reads as chrome and gets missed;
            the icon is the cheapest thing that makes it look like content.
            aria-hidden keeps it out of the button's accessible name. */}
        <span className="pdf-attachments-icon" aria-hidden="true">
          📎
        </span>
        <span className="pdf-attachments-caret" aria-hidden="true" />
        Attachments
        <span className="pdf-attachments-count">{attachments.length}</span>
      </button>

      {isOpen && (
        <ul className="pdf-attachments-list" id="pdf-attachments-list">
          {attachments.map((att) => (
            <li key={att.id} className="pdf-attachment">
              <span className="pdf-attachment-name">{attachmentLabel(att)}</span>
              <AttachmentControl attachment={att} className="pdf-attachment-action" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
