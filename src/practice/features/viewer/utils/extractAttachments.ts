// Practice version of the other project's extractAttachments: the same steps as
// useAttachments (hooks/useViewerDocument), as a plain function the document
// loader can call with the downloaded bytes.
import { PDF } from '@libpdf/core';
import { findRichMediaAudio } from './richMediaAudio';
import type { AttachmentInfo, AttachmentReader } from '../types/attachments';

export type { AttachmentInfo };

// Reads ONE attachment's bytes, called with no argument. The other project's
// AttachmentIndicator calls it as `readAttachment()`, so this is its meaning
// there (types/attachments' ReadAttachment, which takes the attachment, is the
// old useAttachments shape).
export type ReadAttachment = AttachmentReader;

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

  // Example (made-up values), a PDF with a recording and a scanned exhibit.
  // getAttachments() returns a Map: key = the attachment's name, value = its
  // info. Only name and filename are always there; the rest only if the PDF has them.
  //
  //   Map {
  //     'case-note-audio.wav' => { name: 'case-note-audio.wav', filename: 'case-note-audio.wav',
  //                                mimeType: 'audio/wav', size: 412300, createdAt: Date(…) },
  //     'exhibit-a'           => { name: 'exhibit-a', filename: 'Exhibit A - Lease.pdf',
  //                                description: 'Signed lease', mimeType: 'application/pdf', size: 88000 },
  //   }
  //
  // .values() skips the keys, so `info` is one info object per loop. Afterwards:
  //
  //   list    = [ { name: 'case-note-audio.wav', … }, { name: 'exhibit-a', … } ]   what to show
  //   readers = Map { 'case-note-audio.wav' => () => pdf.getAttachment('case-note-audio.wav'),
  //                   'exhibit-a'           => () => pdf.getAttachment('exhibit-a') }  bytes, later
  //
  // On Play: attachmentReader.get('case-note-audio.wav')() → Uint8Array [0x52, 0x49, 0x46, 0x46, …]
  // ("RIFF", a WAV file). name is the PDF's internal key, used for lookups and
  // React keys; filename is what the user sees. Often the same, not always.
  // To see a real PDF's values: console.log(info) inside the loop.
  //
  //‼️ Both methods are libpdf's, on its PDF class (the `pdf` from PDF.load),
  // shortcuts for pdf.attachments.list() and pdf.attachments.get(name). Note
  // the "s":
  //
  //   getAttachments()       Map of name → INFO (name, filename, mimeType, …)   for `list`
  //   getAttachment(name)    one file's BYTES (Uint8Array), or null if no such name   for Play
  //
  // What's ours is everything around them: the loop, list, the readers map,
  // and the () => … that calls getAttachment later. AttachmentIndicator's
  // `if (bytes)` handles the null.
  for (const info of pdf.getAttachments().values()) {
    list.push(info);
    readers.set(info.name, () => pdf.getAttachment(info.name));
  }

  for (const audio of findRichMediaAudio(pdf)) {
    list.push({ name: audio.name, filename: audio.filename, mimeType: audio.mimeType });
    // Stores the read function itself; nothing is decoded until Play calls it.
    //   audio.read                       same: stores the function
    //   () => { return audio.read(); }   same: the () inside wait until Play
    //   audio.read()                     NOT the same: decodes now, stores bytes
    // Passing audio.read alone is safe because it is an arrow function that
    // doesn't use `this` (see richMediaAudio). A class method using `this`
    // would lose it; that one would need the () => wrapper.
    readers.set(audio.name, audio.read);
  }

  return { list, readers };
}
