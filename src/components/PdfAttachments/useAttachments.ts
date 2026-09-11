import { useEffect, useState } from 'react';
import { toAttachments } from './attachments';
import type { PdfAttachment, RawAttachment } from './attachments';

/**
 * The only thing this component needs from a PDF document: a way to ask for
 * its embedded files. Kendo exposes the pdf.js document it already parsed
 * internally, so the viewer can hand that over rather than loading the file
 * a second time.
 */
export interface AttachmentSource {
  getAttachments(): Promise<Record<string, RawAttachment> | undefined>;
}

/**
 * Reads the attachments out of a document and owns the blob URLs it creates.
 *
 * The URLs are revoked when the source changes or the hook unmounts, so a
 * caller never has to think about them — holding them anywhere outside this
 * hook is what leaks them for the life of the tab.
 */
export function useAttachments(source: AttachmentSource | null): PdfAttachment[] {
  const [attachments, setAttachments] = useState<PdfAttachment[]>([]);

  useEffect(() => {
    if (!source) return;

    // Read at cleanup time, not captured — it is still empty if the cleanup
    // runs before the promise below resolves, which the `cancelled` branch
    // then handles instead.
    let created: PdfAttachment[] = [];
    let cancelled = false;

    source
      .getAttachments()
      .then((raw) => {
        created = toAttachments(raw);
        if (cancelled) {
          // The cleanup already ran and saw nothing, so these URLs would
          // otherwise have no owner left to revoke them.
          created.forEach((att) => URL.revokeObjectURL(att.url));
          created = [];
          return;
        }
        setAttachments(created);
      })
      .catch((error: unknown) => {
        // A malformed or unusual file can reject here. The document itself
        // still renders, so log it and show no panel rather than letting an
        // unhandled rejection take the view down.
        console.error('Could not read attachments from the document:', error);
      });

    return () => {
      cancelled = true;
      created.forEach((att) => URL.revokeObjectURL(att.url));
      // Dropping them here keeps a revoked URL from staying on screen while
      // the next document is being read.
      setAttachments([]);
    };
  }, [source]);

  return attachments;
}
