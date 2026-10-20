// Practice copy of ToolbarAttachments from the other project, pasted from its
// source on 2026-10-19, unchanged apart from this header.
import { useEffect, useState } from 'react';
import { Button } from '@progress/kendo-react-buttons';
import { Badge, BadgeContainer } from '@progress/kendo-react-indicators';
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
      {/* Blue icon and a small dot, so audio stands out among Kendo's grey
          tools. "info" is the theme's blue; "primary" is coral red there,
          which reads as an error. A dot rather than a count: a document has
          one recording, so the number would always say 1. The button's
          label already tells screen readers, so the dot is hidden from them. */}
      <BadgeContainer>
        <Button
          type="button"
          fillMode="flat"
          themeColor="info"
          svgIcon={volumeUpIcon}
          title={label}
          aria-label={label}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        />
        <Badge
          themeColor="info"
          size="small"
          rounded="full"
          position="inside"
          align={{ vertical: 'top', horizontal: 'end' }}
          className="audio-dot-badge"
          aria-hidden="true"
        />
      </BadgeContainer>

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
