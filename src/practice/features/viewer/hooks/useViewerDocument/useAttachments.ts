// Practice copy of useAttachments from the other project, rebuilt from a photo
// of its source, unchanged. Only here to test against.
import { useState, useEffect, useRef, useCallback } from 'react';
import { PDF } from '@libpdf/core';
import { findRichMediaAudio } from '../../utils/richMediaAudio';
import type { AttachmentInfo, PDFBytesSource, ReadAttachment } from '../../types/attachments';

// List the files embedded in a PDF, and reads on demand.
export function useAttachments(document: PDFBytesSource | null) {
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const readersRef = useRef(new Map<string, () => Uint8Array | null>());

  useEffect(() => {
    if (!document) return;

    let cancelled = false;

    document
      .getData()
      .then((bytes) => PDF.load(bytes))
      .then((pdf) => {
        if (cancelled) return;

        const list: AttachmentInfo[] = [];
        const readers = new Map<string, () => Uint8Array | null>();

        // Direct audio attachments
        for (const info of pdf.getAttachments().values()) {
          list.push(info);
          readers.set(info.name, () => pdf.getAttachment(info.name));
        }

        // Audio inside RichMedia annotations
        for (const audio of findRichMediaAudio(pdf)) {
          list.push({ name: audio.name, filename: audio.filename, mimeType: audio.mimeType });
          readers.set(audio.name, audio.read);
        }

        readersRef.current = readers;
        setAttachments(list);
      })
      .catch((error: unknown) => {
        console.error('Could not read attachments: ', error);
      });

    return () => {
      cancelled = true;
      readersRef.current = new Map();
      setAttachments([]);
    };
  }, [document]);

  // Returns one attachment's bytes, or null if document is gone
  const readAttachment = useCallback<ReadAttachment>(
    (attachment) => readersRef.current?.get(attachment.name)?.() ?? null,
    [],
  );

  return { attachments, readAttachment };
}
