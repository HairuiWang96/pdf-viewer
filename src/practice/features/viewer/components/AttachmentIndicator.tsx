// Practice copy of AttachmentIndicator from the other project, pasted from its
// source on 2026-10-19, unchanged apart from this header.
import { useEffect, useState } from 'react';
import { detectAudioType } from '../utils/audioDetection';
import { Button } from '@progress/kendo-react-all';
import { playIcon } from '@progress/kendo-svg-icons';
import { useViewerStore } from '../data/viewerStore';
import { type AttachmentInfo, type ReadAttachment } from '../utils/extractAttachments';

function AudioAttachment({
  attachment,
  type,
  readAttachment,
}: {
  attachment: AttachmentInfo;
  type: string;
  readAttachment: ReadAttachment;
}) {
  const [url, setUrl] = useState<string | null>(null);

  // Cleanup only: frees the audio's memory when the URL is replaced or the player goes away. A blob URL
  // holds its bytes until it is revoked.
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
    return (
      <Button type="button" svgIcon={playIcon} onClick={play}>
        {attachment.filename}
      </Button>
    );
  }

  return (
    <div>
      <div>{attachment.filename}</div>
      {/* Play only, no download */}
      <audio
        className="attachment-audio"
        controls
        controlsList="nodownload"
        onContextMenu={(event) => event.preventDefault()}
        autoPlay
        src={url}
      />
    </div>
  );
}

export function AttachmentIndicator() {
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
