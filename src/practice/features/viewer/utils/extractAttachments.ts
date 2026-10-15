// Practice version of the other project's extractAttachments: the same steps as
// useAttachments (hooks/useViewerDocument), as a plain function the document
// loader can call with the downloaded bytes.
import { PDF } from '@libpdf/core';
import { findRichMediaAudio } from './richMediaAudio';
import type { AttachmentInfo, ReadAttachment } from '../types/attachments';

export type { AttachmentInfo, ReadAttachment };

export interface ExtractedAttachments {
  // The list shown on screen
  list: AttachmentInfo[];
  // Attachment name → function that reads its bytes, called on Play
  readers: Map<string, ReadAttachment>;
}

// Lists the files embedded in a PDF: normal attachments, and audio inside
// RichMedia annotations
export async function extractAttachments(bytes: Uint8Array): Promise<ExtractedAttachments> {
  const pdf = await PDF.load(bytes);
  const list: AttachmentInfo[] = [];
  const readers = new Map<string, ReadAttachment>();

  for (const info of pdf.getAttachments().values()) {
    list.push(info);
    readers.set(info.name, () => pdf.getAttachment(info.name));
  }

  for (const audio of findRichMediaAudio(pdf)) {
    list.push({ name: audio.name, filename: audio.filename, mimeType: audio.mimeType });
    readers.set(audio.name, audio.read);
  }

  return { list, readers };
}
