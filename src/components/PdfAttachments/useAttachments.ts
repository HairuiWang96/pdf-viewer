import { useEffect, useState } from 'react';
import { PDF } from '@libpdf/core';
import { guessAudioMimeType } from './attachments';
import type { PdfAttachment } from './attachments';
import { collectAttachments, readAttachment } from './attachmentStreams';
import type { AttachmentEntry } from './attachmentStreams';

/**
 * The one thing this hook wants from the viewer: the bytes it already holds.
 *
 * pdf.js keeps the document it downloaded and returns the raw file from
 * `getData()`, so borrowing them costs no network at all. Kendo exposes the
 * pdf.js document it parsed internally, which is where this comes from.
 */
export interface AttachmentBytes {
  getData(): Promise<Uint8Array>;
}

/**
 * Parses the document, preferring bytes somebody has already downloaded.
 *
 * ── Why this is not simply a fetch ──
 *
 * Three separate things on this page load the same PDF: the viewer, the
 * thumbnail sidebar, and this hook. The browser's HTTP cache normally collapses
 * that to one transfer and two revalidations — which is what it does for an
 * 8 MB file, and why the duplication went unnoticed.
 *
 * It stops doing so once the file is large enough. Chromium refuses to store a
 * cache entry past a size threshold, so nothing is cached, nothing can be
 * revalidated, and all three become full downloads. Measured on the deployed
 * build: a 29.7 MB case file transferred three times, ~89 MB, against a page
 * that needs 42 KB to render.
 *
 * So the fetch below is the fallback, not the path. Given a `source`, this
 * borrows the viewer's bytes and the listing costs nothing.
 */
async function loadDocument(filePath: string, source: AttachmentBytes | null): Promise<PDF> {
  if (source) return PDF.load(await source.getData());

  const response = await fetch(filePath);
  return PDF.load(new Uint8Array(await response.arrayBuffer()));
}

/**
 * The MIME type to hand an <audio> element, or null if this is not playable.
 *
 * The document's own /Subtype is preferred — it is what the author declared —
 * and the extension guess is only a fallback for files that declare nothing.
 * The guess still has to run: plenty of tools attach a file without saying
 * what it is.
 */
function playableType(entry: AttachmentEntry): string | null {
  if (entry.mimeType) return entry.mimeType.startsWith('audio/') ? entry.mimeType : null;
  return guessAudioMimeType(entry.filename);
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
 * RichMedia audio at all. So the structure is read separately — but from the
 * bytes pdf.js already downloaded, not from a second request. See
 * `loadDocument` for why that distinction turned out to matter.
 *
 * `source` should be referentially stable, and is null until the viewer has
 * parsed the document. Until then the hook reports nothing, which is the same
 * as it reported while a fetch was in flight.
 */
export function useAttachments(
  filePath: string | undefined,
  source: AttachmentBytes | null = null,
): PdfAttachment[] {
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
    let reparse: Promise<PDF> | undefined;
    const parse = () => (reparse ??= loadDocument(filePath, source));

    loadDocument(filePath, source)
      .then((document) => {
        if (cancelled) return;

        // An AttachmentEntry is plain data — names, sizes, a source tag — and
        // holds nothing reachable from the parsed document. That is what lets
        // the `read` closure below capture one without pinning the discovery
        // parse in memory, which would silently undo the paragraph above.
        const listed = collectAttachments(document);

        setAttachments(
          listed.map((entry) => ({
            id: entry.id,
            filename: entry.filename,
            size: entry.size,
            page: entry.page,
            mimeType: playableType(entry),
            read: async () => readAttachment(await parse(), entry),
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
  }, [filePath, source]);

  return attachments;
}
