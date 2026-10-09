import { useEffect, useState } from 'react';
import { Button, Popup } from '@progress/kendo-react-all';
import { volumeUpIcon } from '@progress/kendo-svg-icons';
import type { AttachmentInfo, ReadAttachment } from '../types/attachments';
import { AttachmentIndicator } from './AttachmentIndicator';

interface ToolbarAttachmentsProps {
  attachments: AttachmentInfo[];
  readAttachment: ReadAttachment;
}

// Audio icon and count in the viewer toolbar; opens the attachment list in a popup
export function ToolbarAttachments({ attachments, readAttachment }: ToolbarAttachmentsProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Kept in state, not a ref: the Popup needs the element during render
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);

  // Close on Escape while open
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (attachments.length === 0) return null;

  const label = `Audio (${attachments.length})`;

  return (
    <span ref={setAnchor}>
      <Button type='button' fillMode='flat' svgIcon={volumeUpIcon} title={label} aria-label={label} aria-expanded={isOpen} onClick={() => setIsOpen(open => !open)}>
        {attachments.length}
      </Button>
      {/* Rendered into document.body, so the toolbar's overflow cannot clip it */}
      <Popup
        anchor={anchor}
        show={isOpen}
        anchorAlign={{ horizontal: 'right', vertical: 'bottom' }}
        popupAlign={{ horizontal: 'right', vertical: 'top' }}
        onMouseDownOutside={event => {
          // The button toggles on its own; closing here too would reopen it
          if (anchor?.contains(event.event.target as Node)) return;
          setIsOpen(false);
        }}
      >
        {/* Wide enough that the audio player keeps its seek bar */}
        <div style={{ width: 320, maxWidth: 'calc(100vw - 16px)', padding: 12 }}>
          <AttachmentIndicator attachments={attachments} readAttachment={readAttachment} />
        </div>
      </Popup>
    </span>
  );
}
