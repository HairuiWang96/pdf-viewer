// A variant of AttachmentIndicator.tsx (the copy of doc-viewer's, kept as it
// is), to try out. Not in doc-viewer, and not used anywhere here yet: the
// details panel and the toolbar still use AttachmentIndicator.
//
// The difference: the player shows straight away, with a silent placeholder,
// instead of a "▷ filename" button that opened it. The audio is still
// unpacked only on the first ▶.
import { useEffect, useRef, type SyntheticEvent } from 'react';
import { detectAudioType } from '../utils/audioDetection';
import { useViewerStore } from '../data/viewerStore';
import { type AttachmentInfo, type ReadAttachment } from '../utils/extractAttachments';

// A silent sound one sample long (a 45-byte WAV), written out as a fixed
// address. It only exists so the player starts enabled: an <audio> with no
// source is greyed out and ignores clicks. Swapped for the real audio on the
// first ▶ (see onPlay below).
const PLACEHOLDER_SRC =
  'data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA';

function AudioAttachment({
  attachment,
  type,
  readAttachment,
}: {
  attachment: AttachmentInfo;
  type: string;
  readAttachment: ReadAttachment;
}) {
  // The real audio's blob URL, once unpacked. A ref, not state: swapping it in
  // must not wait for a re-render, because it happens in the middle of the
  // user's click (see onPlay)
  const realUrl = useRef<string | null>(null);

  // Cleanup only: frees the audio's memory when the player goes away. A blob
  // URL holds its bytes until it is revoked.
  useEffect(
    () => () => {
      if (realUrl.current) URL.revokeObjectURL(realUrl.current);
    },
    [],
  );

  // The first ▶ starts the placeholder: unpack the real audio, swap it in and
  // play that instead. Done right inside the click's event, so browsers still
  // count it as the user starting the sound (Safari is strict about this).
  // Later ▶ / ⏸ are the browser's own.
  const onPlay = (event: SyntheticEvent<HTMLAudioElement>) => {
    if (realUrl.current) return;
    const bytes = readAttachment();
    if (!bytes) return;
    const audio = event.currentTarget;
    realUrl.current = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    audio.src = realUrl.current;
    void audio.play();
  };

  return (
    <div>
      <div>{attachment.filename}</div>
      {/* Play only, no download */}
      <audio
        className="attachment-audio"
        controls
        controlsList="nodownload"
        onContextMenu={(event) => event.preventDefault()}
        src={PLACEHOLDER_SRC}
        onPlay={onPlay}
      />
    </div>
  );
}

export function AttachmentIndicatorWithPlaceholder() {
  const attachments = useViewerStore((state) => state.attachments);
  const attachmentReader = useViewerStore((state) => state.attachmentReader);

  if (attachments.length === 0) return null;

  return (
    <div>
      <strong>Audio ({attachments.length})</strong>
      <ul style={{ listStyle: 'none', padding: 12 }}>
        {attachments.map((a) => {
          const type = detectAudioType(a.filename, a.mimeType);
          const readAttachment = attachmentReader?.get(a.name);
          if (readAttachment) {
            return (
              <li key={a.name}>
                {type && (
                  <AudioAttachment attachment={a} type={type} readAttachment={readAttachment} />
                )}
              </li>
            );
          }
        })}
      </ul>
    </div>
  );
}
