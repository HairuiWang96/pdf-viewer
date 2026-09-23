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
 * Several things on this page load the same PDF: the Kendo viewer, the
 * thumbnail sidebar, and — until this argument existed — this hook. On a small
 * file the browser's cache collapsed that to one transfer and some
 * revalidations, which is why the duplication went unnoticed for so long.
 *
 * On a large one it did not. Measured on the deployed build, cold:
 *
 *     before   3 × 200   ~89 MB     for a page that needs 42 KB to render
 *     after    1 × 200   29.7 MB    plus 2 × 304
 *
 * **Why removing one request fixed the other two is not established.** The
 * measurement is repeatable; the mechanism is a guess. The likeliest is
 * timing — this hook's fetch started earliest, on mount, before the viewer and
 * the sidebar had initialised — but that was not verified, and an earlier
 * theory about Chromium refusing to cache large entries turned out to be wrong
 * when the file cached perfectly well on a later run. Note also that three
 * requests still appear, so one of the remaining consumers issues two; which
 * one has not been checked.
 *
 * What is certain is that borrowing already-downloaded bytes cannot cost a
 * transfer, whatever the cache does. That is the reason for this argument, and
 * it holds regardless of the explanation. The fetch below is the fallback for
 * a caller with no viewer to borrow from — only, since a later fix; see
 * `useAttachments` for how "no viewer" is told apart from "not ready yet".
 */
async function loadDocument(filePath: string, source: AttachmentBytes | undefined): Promise<PDF> {
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
 * `source` should be referentially stable. Its two empty values mean
 * different things, and the difference is what keeps this hook off the
 * network:
 *
 *   null        there is a viewer, but it has not parsed the document yet —
 *               wait for it, and report nothing meanwhile
 *   undefined   there is no viewer to borrow from — fetch the file
 *
 * These used to be one value, null, which fell through to the fetch. The
 * hook's effect runs before Kendo has parsed anything, so on every case switch
 * it downloaded the whole file itself while the viewer was downloading it too:
 * on the 28 MB fixture, one of four full downloads (ATTACHMENT-EXTRACTION.md
 * §5). The comment here said the application never took that path. It took it
 * every time.
 *
 * ── Why a fetch fallback at all, when the only caller has a viewer ──
 *
 * This is a comparison repo, and the other viewer branches do not all expose
 * the pdf.js document the way KendoReact does — `react-pdf` and the iframe
 * viewer have nothing to hand over. A hook that cannot work without a viewer
 * would not port to them. Cheap insurance; delete it the day this becomes one
 * viewer rather than five.
 */
export function useAttachments(
  filePath: string | undefined,
  source?: AttachmentBytes | null,
): PdfAttachment[] {
  const [attachments, setAttachments] = useState<PdfAttachment[]>([]);

  useEffect(() => {
    // null: the viewer exists but has nothing yet. Its document arrives as a
    // new `source`, which runs this effect again.
    if (!filePath || source === null) return;

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
