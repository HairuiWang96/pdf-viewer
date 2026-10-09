import { useEffect, useState } from 'react';
import type { AttachmentInfo, ReadAttachment } from '../hooks/useAttachments';
import { detectAudioType } from '../utils/audioDetection';
import { Button } from '@progress/kendo-react-all';
import { SvgIcon } from '@progress/kendo-react-common';
import { playIcon, downloadIcon, paperclipIcon } from '@progress/kendo-svg-icons';

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
      <audio controls autoPlay src={url} />
      <a href={url} download={attachment.filename}>
        <SvgIcon icon={downloadIcon} /> Download
      </a>
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
