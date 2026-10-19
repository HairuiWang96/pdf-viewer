// Practice copy of ToolbarAttachments from the other project, pasted from its
// source on 2026-10-19, unchanged apart from this header.
import { useEffect, useState } from 'react';
import { Button } from '@progress/kendo-react-buttons';
import { Popup } from '@progress/kendo-react-popup';
import { volumeUpIcon } from '@progress/kendo-svg-icons';
import { AttachmentIndicator } from './AttachmentIndicator';
import { useViewerStore } from '../data/viewerStore';

export function ToolbarAttachments() {
  const [isOpen, setIsOpen] = useState(false);
  // Kept in state, not a ref: the popup needs the element during render
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);

  const attachments = useViewerStore((state) => state.attachments);

  // Close on Escap Key when open
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
      <Button
        type="button"
        fillMode="flat"
        svgIcon={volumeUpIcon}
        title={label}
        aria-label={label}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {/* {attachments.length} */}
      </Button>

      <Popup
        anchor={anchor}
        show={isOpen}
        anchorAlign={{ horizontal: 'right', vertical: 'bottom' }}
        popupAlign={{ horizontal: 'right', vertical: 'top' }}
        onMouseDownOutside={(event) => {
          // The button toggles on its own; closing here too would reopen it
          if (anchor?.contains(event.event.target as Node)) return;
          setIsOpen(false);
        }}
      >
        {/* Wide enough that the audio player keeps its seek bar */}
        <div style={{ width: 320, maxWidth: 'calc(100vw - 16px)' }}>
          <AttachmentIndicator />
        </div>
      </Popup>
    </span>
  );
}
