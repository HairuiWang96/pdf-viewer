import { useCallback } from 'react';
import { formatSize } from './attachments';
import type { PdfAttachment } from './attachments';
import { useAttachmentUrl } from './useAttachmentUrl';
import './AttachmentControl.css';

interface AttachmentControlProps {
  attachment: PdfAttachment;
  /** The placement's own class for the trigger, so each keeps its styling. */
  className?: string;
}

/**
 * The part of an attachment row that actually costs something: the control
 * that fetches the file, and the player or download it turns into.
 *
 * Shared by all three placements rather than written three times, because it
 * is the one piece of attachment UI that is not a design question. Where the
 * indicator lives is what the placements are comparing; what happens after
 * someone presses play is the same answer in all three.
 *
 * Every attachment starts as a button and nothing else. The bytes are read on
 * that first press — see PdfAttachment — so until then this is a label, and a
 * document full of large attachments costs nothing to display.
 */
export default function AttachmentControl({ attachment, className }: AttachmentControlProps) {
  const { state, load } = useAttachmentUrl(attachment);
  const isAudio = attachment.mimeType?.startsWith('audio/') ?? false;

  const handleClick = useCallback(async () => {
    const url = await load();
    // Audio swaps this button for a player, which autoplays. A download has no
    // such resting state, so it has to be started here.
    if (!url || isAudio) return;

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = attachment.filename;
    anchor.click();
  }, [load, isAudio, attachment.filename]);

  if (state.status === 'ready' && isAudio) {
    // autoPlay because the click that got us here was a request to play, and
    // making someone press play twice for the same file reads as a bug.
    return <audio controls autoPlay src={state.url} />;
  }

  const size = formatSize(attachment.size);

  return (
    <button
      type="button"
      className={`attachment-control ${className ?? ''}`.trim()}
      // Reading is in flight; a second press would do nothing useful.
      disabled={state.status === 'loading'}
      onClick={handleClick}
    >
      {state.status === 'loading' && 'Loading…'}
      {state.status === 'failed' && 'Unavailable'}
      {(state.status === 'idle' || state.status === 'ready') && (isAudio ? 'Play' : 'Download')}
      {/* The size is the whole reason this is worth showing before the click:
          it is what tells someone whether pressing play is instant or a
          download. Hidden once the state text is the more useful thing. */}
      {size && state.status !== 'loading' && (
        <span className="attachment-control-size">{size}</span>
      )}
    </button>
  );
}
