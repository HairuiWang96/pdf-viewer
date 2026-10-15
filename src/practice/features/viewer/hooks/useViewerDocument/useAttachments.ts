// Practice copy of useAttachments from the other project, rebuilt from a photo
// of its source, unchanged apart from comments. Only here to test against.
import { useState, useEffect, useRef, useCallback } from 'react';
import { PDF } from '@libpdf/core';
import { findRichMediaAudio } from '../../utils/richMediaAudio';
import type { AttachmentInfo, PDFBytesSource, ReadAttachment } from '../../types/attachments';

// List the files embedded in a PDF, and reads on demand.
export function useAttachments(document: PDFBytesSource | null) {
  // The list shown on screen
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);

  // Attachment name → function that reads its bytes. Functions, not bytes, so
  // nothing is decoded until Play. A ref, since changing it needs no re-render.
  const readersRef = useRef(new Map<string, () => Uint8Array | null>());

  useEffect(() => {
    if (!document) return;

    // Set by the cleanup below, so a slow load for an old document is ignored
    let cancelled = false;

    // Full PDF bytes from Kendo → parse with libpdf
    document
      .getData()
      .then((bytes) => PDF.load(bytes))
      .then((pdf) => {
        if (cancelled) return;

        const list: AttachmentInfo[] = [];
        const readers = new Map<string, () => Uint8Array | null>();

        // Normal attachments (any file type; the indicator shows only audio)
        for (const info of pdf.getAttachments().values()) {
          list.push(info);
          readers.set(info.name, () => pdf.getAttachment(info.name));
        }

        // Audio inside RichMedia annotations
        for (const audio of findRichMediaAudio(pdf)) {
          list.push({ name: audio.name, filename: audio.filename, mimeType: audio.mimeType });
          readers.set(audio.name, audio.read);
        }

        // Swap in the new table and list together
        readersRef.current = readers;
        setAttachments(list);
      })
      .catch((error: unknown) => {
        console.error('Could not read attachments: ', error);
      });

    // Document changed or component gone: forget the old attachments
    return () => {
      cancelled = true;
      readersRef.current = new Map();
      setAttachments([]);
    };
  }, [document]);

  // Returns one attachment's bytes, or null if document is gone. Created once
  // ([] deps) and reads the ref at call time, so it always sees the latest table.
  const readAttachment = useCallback<ReadAttachment>(
    (attachment) => readersRef.current?.get(attachment.name)?.() ?? null,
    [],
  );

  return { attachments, readAttachment };
}
