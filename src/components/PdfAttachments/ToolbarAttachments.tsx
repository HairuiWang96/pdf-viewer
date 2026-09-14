import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import type { PdfAttachment } from './attachments';
import './ToolbarAttachments.css';

interface ToolbarAttachmentsProps {
  attachments: PdfAttachment[];
}

/**
 * Placement 2 of 3 — an icon and count in the viewer's toolbar.
 *
 * The compact option: costs no layout space at all, because it lives in a bar
 * that already exists. Clicking opens a popover anchored under the button, so
 * the list appears over the document and disappears again.
 *
 * Reads as part of the *tooling* rather than the document — attachments become
 * one more thing the viewer can do, alongside zoom and print. That framing is
 * the trade: it is tidy and familiar, but a badge among other icons is quiet,
 * and someone who never scans the toolbar will never learn the file has audio
 * in it. Compare BottomBarAttachments, which cannot be missed but is always
 * taking up room.
 */
export default function ToolbarAttachments({ attachments }: ToolbarAttachmentsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  const close = useCallback(() => setIsOpen(false), []);

  /**
   * Kendo's toolbar fights this popover in two separate ways, and it needs
   * both answers or it looks broken in two different styles.
   *
   * `.k-toolbar` is `overflow: hidden`, so a popover placed inside it is
   * clipped away the moment it extends past the bar — nothing appears at all.
   * Fixed positioning escapes that, at the cost of placing the box by hand,
   * which is what the measuring below is for. CaseSelector's tooltip escapes
   * the sidebar's clipping the same way.
   *
   * `.k-toolbar` is also `position: relative` with `z-index: 1`, which makes
   * it a *stacking context* — and z-index cannot climb out of one. So the
   * popover was painting under the document, because `.k-page` carries the
   * same `z-index: 1` as the toolbar and comes later in the DOM. No z-index
   * here could have won that, however large. Only leaving the context does,
   * hence the portal to document.body.
   */
  const position = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    setPopoverStyle({
      top: rect.bottom + 6,
      // Right-aligned to the button, but never pushed off the left edge on a
      // narrow screen.
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  // Measured on open rather than on every render, and kept honest while open:
  // a fixed element does not move with the thing it is anchored to.
  useEffect(() => {
    if (!isOpen) return;

    position();
    window.addEventListener('resize', position);
    return () => window.removeEventListener('resize', position);
  }, [isOpen, position]);

  // A popover that ignores Escape and outside clicks is a popover users get
  // stuck in. Both listeners are only attached while it is actually open.
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      // The popover is portalled out of this component's DOM subtree, so
      // containerRef alone would treat every click *inside* the popover as a
      // click outside it — closing it the instant anyone pressed play.
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      close();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [isOpen, close]);

  if (attachments.length === 0) return null;

  return (
    <div className="toolbar-attachments" ref={containerRef}>
      <button
        type="button"
        ref={buttonRef}
        className="toolbar-attachments-button"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span aria-hidden="true">📎</span>
        {/* The icon carries no text, so the name has to say the whole thing. */}
        <span className="toolbar-attachments-label">
          Attachments
          <span className="toolbar-attachments-count">{attachments.length}</span>
        </span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className="toolbar-attachments-popover"
            role="dialog"
            aria-label="Attachments"
            style={popoverStyle}
          >
            <ul className="toolbar-attachments-list">
              {attachments.map((att) => (
                <li key={att.filename} className="toolbar-attachment">
                  <span className="toolbar-attachment-name" title={att.filename}>
                    {att.filename}
                  </span>
                  {att.mimeType?.startsWith('audio/') ? (
                    <audio controls src={att.url} />
                  ) : (
                    <a
                      className="toolbar-attachment-download"
                      href={att.url}
                      download={att.filename}
                    >
                      Download
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
