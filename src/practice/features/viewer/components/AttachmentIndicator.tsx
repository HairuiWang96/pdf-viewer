// Practice copy of AttachmentIndicator from the other project, pasted from its
// source on 2026-10-19.
//
// Changed since (proposed, not in doc-viewer yet): the "▷ filename" button is
// a full-width pill (Kendo's rounded="full", size="large"), like the browser's
// audio player it opens into.
import { useEffect, useState } from 'react';
import { detectAudioType } from '../utils/audioDetection';
import { Button } from '@progress/kendo-react-all';
import { playIcon } from '@progress/kendo-svg-icons';
import { useViewerStore } from '../data/viewerStore';
import { type AttachmentInfo, type ReadAttachment } from '../utils/extractAttachments';

function AudioAttachment({ attachment, type, readAttachment }: { attachment: AttachmentInfo; type: string; readAttachment: ReadAttachment }) {
  const [url, setUrl] = useState<string | null>(null);

  //  The cleanup knows the last URL because of a closure: each cleanup function remembers the url from the render that created it.

  // Cleanup only: frees the audio's memory when the URL is replaced or the player goes away. A blob URL
  // holds its bytes until it is revoked.
  //
  // `() => () => { … }`: the effect does no work; it only returns the cleanup,
  // which keeps the `url` from the render that made it (a closure). React runs
  // the PREVIOUS run's cleanup before the next run (url changed) and on
  // unmount, so each cleanup frees the URL it was made with, never the new one:
  //
  //   first render     url null      cleanup #1 keeps null
  //   Play pressed     url blob:A    #1 runs: null, nothing to free; #2 keeps A
  //   (URL replaced)   url blob:B    #2 runs: frees A; #3 keeps B
  //   unmount                        last cleanup runs: frees the current URL
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const play = () => {
    const bytes = readAttachment();
    if (bytes) setUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type })));
  };

  if (!url) {
    // A pill like the player it opens into: Kendo's own rounded, large button,
    // so the theme sets its colours, hover and focus. global.css only makes it
    // full width, left-aligned, with long names ending in "…"
    return (
      <Button type='button' svgIcon={playIcon} rounded='full' size='large' className='attachment-play' onClick={play}>
        {attachment.filename}
      </Button>
    );
  }

  return (
    <div>
      <div>{attachment.filename}</div>
      {/* Play only, no download.
          - controlsList="nodownload" hides Download in the player's own ⋮ menu
            (Chrome and Edge).
          - onContextMenu fires on a right-click (or a long-press on a phone).
            preventDefault() tells the browser not to do what it normally does
            for the event, here opening its menu, which offers "Save audio
            as…" and "Copy audio address". (On a form's onSubmit, the same call
            stops the page reloading.)
          Only removes the easy buttons, not real protection: someone
          determined can still get the audio, e.g. through DevTools. */}
      <audio className='attachment-audio' controls controlsList='nodownload' onContextMenu={event => event.preventDefault()} autoPlay src={url} />
    </div>
  );
}

export function AttachmentIndicator() {
  const attachments = useViewerStore(state => state.attachments);
  const attachmentReader = useViewerStore(state => state.attachmentReader);

  if (attachments.length === 0) return null;

  return (
    <div>
      <strong>Audio ({attachments.length})</strong>
      <ul style={{ listStyle: 'none', padding: 12 }}>
        {attachments.map(a => {
          const type = detectAudioType(a.filename, a.mimeType);
          const readAttachment = attachmentReader?.get(a.name);
          if (readAttachment) {
            return <li key={a.name}>{type && <AudioAttachment attachment={a} type={type} readAttachment={readAttachment} />}</li>;
          }
        })}
      </ul>
    </div>
  );
}
