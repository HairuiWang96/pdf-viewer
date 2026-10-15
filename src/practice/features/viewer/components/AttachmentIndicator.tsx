import { useEffect, useState } from 'react';
import type { AttachmentInfo, ReadAttachment } from '../types/attachments';
import { detectAudioType } from '../utils/audioDetection';
import { Button } from '@progress/kendo-react-all';
import { SvgIcon } from '@progress/kendo-react-common';
import { playIcon, paperclipIcon } from '@progress/kendo-svg-icons';

interface AttachmentIndicatorProps {
  attachments: AttachmentInfo[];
  readAttachment: ReadAttachment;
}

// Save a non-audio file under its real name, maybe need support in future
// Commented out with its button below: only audio is shown for now
// function download(attachment: AttachmentInfo, readAttachment: ReadAttachment) {
//   const bytes = readAttachment(attachment);
//   if (!bytes) return;
//
//   const link = document.createElement('a');
//   link.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: attachment.mimeType }));
//   link.download = attachment.filename;
//   link.click();
//   URL.revokeObjectURL(link.href);
// }

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

  // Cleanup only: frees the audio's memory when the URL is replaced or the
  // player goes away. A blob URL holds its bytes until it is revoked.
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const play = () => {
    const bytes = readAttachment(attachment);
    if (bytes) setUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type })));
  };

  if (!url) {
    return (
      <Button type="button" svgIcon={playIcon} onClick={play}>
        {' '}
        {attachment.filename}
      </Button>
    );
  }

  return (
    <div>
      <div>{attachment.filename}</div>
      {/* Play only, no download. nodownload hides Chrome and Edge's own
          Download item in the player menu; blocking the right-click menu
          removes "Save audio as". This discourages saving, it cannot prevent
          it: the bytes are already in the browser. */}
      <audio
        controls
        controlsList="nodownload"
        onContextMenu={(event) => event.preventDefault()}
        autoPlay
        src={url}
      />
    </div>
  );
}

export function AttachmentIndicator({ attachments, readAttachment }: AttachmentIndicatorProps) {
  if (attachments.length === 0) return null;

  return (
    <div>
      <strong>
        {' '}
        <SvgIcon icon={paperclipIcon} /> Attachments ({attachments.length})
      </strong>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {attachments.map((a) => {
          const type = detectAudioType(a.filename, a.mimeType);
          // Non-audio files are skipped while their download is commented out
          if (!type) return null;
          return (
            <li key={a.name}>
              <AudioAttachment attachment={a} type={type} readAttachment={readAttachment} />
              {/* <button type="button" onClick={() => download(a, readAttachment)}>
                {a.filename}
              </button> */}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
