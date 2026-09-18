import { useEffect, useState } from 'react';
import { PDFDocument, decodePDFRawStream } from 'pdf-lib';
import { guessAudioMimeType } from './attachments';
import type { PdfAttachment } from './attachments';
import { collectAttachmentStreams } from './attachmentStreams';

/** Parses a document from its URL. The fetch is the browser's to cache. */
async function loadDocument(filePath: string): Promise<PDFDocument> {
  const response = await fetch(filePath);
  // These files are often old and written by tools that predate a lot of
  // tightening, so one unparseable object should cost us that object rather
  // than the whole document.
  return PDFDocument.load(await response.arrayBuffer(), { throwOnInvalidObject: false });
}

/**
 * Reads one file's bytes, re-finding it by name in a freshly parsed document.
 *
 * Looking it up again rather than holding the stream from discovery is what
 * keeps discovery cheap — see the note in the hook below.
 */
async function readAttachment(
  parse: () => Promise<PDFDocument>,
  filename: string,
): Promise<Uint8Array> {
  const found = collectAttachmentStreams(await parse()).get(filename);
  if (!found) throw new Error(`${filename} is no longer in the document`);
  return decodePDFRawStream(found.stream).decode();
}

/**
 * Lists the files a document carries, without reading any of them.
 *
 * The list is everything an indicator needs — a name, a size, and whether it
 * is playable — and costs one parse of the document's structure. The bytes
 * behind each entry are fetched only if somebody asks for them, through the
 * `read` on each attachment. An attachment can be hundreds of megabytes, and
 * the overwhelming majority are never opened, so loading them to render a
 * badge would be the wrong trade.
 *
 * ── Why this parses the file rather than reusing the viewer's ──
 *
 * The viewer has already parsed the document with pdf.js, and pdf.js will hand
 * over its attachments — but getAttachments() decodes all of them in the
 * process, which is the eagerness we are trying to avoid, and it cannot see
 * RichMedia audio at all. So this reads the file itself. The fetch re-requests
 * something the viewer has already loaded, so in practice it is served from
 * the browser's HTTP cache rather than the network.
 */
export function useAttachments(filePath: string | undefined): PdfAttachment[] {
  const [attachments, setAttachments] = useState<PdfAttachment[]>([]);

  useEffect(() => {
    if (!filePath) return;

    let cancelled = false;

    /**
     * The parse that `read` works from, created on the first call and shared
     * by every attachment in this listing.
     *
     * Deliberately not the discovery parse below. Holding onto that one would
     * keep the whole document — source bytes included — alive for as long as
     * the listing is on screen, which for a large file is precisely the cost
     * this hook exists to avoid. Nobody plays anything in the common case, so
     * the discovery parse is left to be collected and paid for again only if
     * somebody actually asks.
     */
    let reparse: Promise<PDFDocument> | undefined;
    const parse = () => (reparse ??= loadDocument(filePath));

    loadDocument(filePath)
      .then((document) => {
        if (cancelled) return;

        // Note what is copied out here: names and sizes, nothing else. An
        // AttachmentStream holds a live pdf-lib object, and capturing one in
        // the `read` closure below would pin the discovery parse in memory —
        // silently undoing the paragraph above, with nothing to show for it.
        const listed = [...collectAttachmentStreams(document).values()].map(
          ({ filename, size }) => ({ filename, size }),
        );

        setAttachments(
          listed.map(({ filename, size }) => ({
            filename,
            size,
            mimeType: guessAudioMimeType(filename),
            read: () => readAttachment(parse, filename),
          })),
        );
      })
      .catch((error: unknown) => {
        // A malformed or unusual file can reject here. The document itself
        // still renders, so log it and show no panel rather than letting an
        // unhandled rejection take the view down.
        console.error('Could not read attachments from the document:', error);
      });

    return () => {
      cancelled = true;
      // Dropping the list here keeps the previous file's attachments from
      // being shown against the next one while it is still being read.
      setAttachments([]);
    };
  }, [filePath]);

  return attachments;
}
