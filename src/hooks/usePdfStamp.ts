import { useCallback, useEffect, useState } from 'react';
import { PDF, StandardFonts, measureText, rgb } from '@libpdf/core';

/**
 * A Standard 14 font needs no embedding here — it is named rather than
 * supplied, and `measureText` works off the same name. pdf-lib needed an
 * `embedFont` round trip before it could measure anything.
 */
const STAMP_FONT = StandardFonts.HelveticaBold;
const STAMP_SIZE = 10;

/**
 * Draws the stamp text onto the PDF client-side and hands back a blob URL.
 *
 * `defaultOn` is the toggle's resting position: OFF while the user is picking
 * between several cases, ON when there is only one case to look at. The choice
 * is stored against the `resetKey` it was made under — bumped every time a case
 * is selected — so picking a case always starts from the default rather than
 * inheriting the previous case's toggle.
 */
export default function usePdfStamp(
  filePath: string,
  stampText: string,
  { defaultOn = false, resetKey = 0 }: { defaultOn?: boolean; resetKey?: number } = {},
) {
  const [stampChoice, setStampChoice] = useState({ resetKey, on: defaultOn });
  const [stampedUrl, setStampedUrl] = useState<string | null>(null);

  const showStamp = stampChoice.resetKey === resetKey ? stampChoice.on : defaultOn;

  const toggleStamp = useCallback(
    (stamped: boolean) => {
      setStampChoice({ resetKey, on: stamped });
    },
    [resetKey],
  );

  useEffect(() => {
    if (!showStamp) return;

    // The URL this run created, read at cleanup time rather than captured.
    // Holding it here instead of reading `stampedUrl` in the cleanup is the
    // point: `stampedUrl` is state, so the cleanup would close over its value
    // from the render the effect ran in — null, since this run has not set it
    // yet — and revoke nothing, leaking a whole stamped PDF on every switch.
    let created: string | null = null;
    let cancelled = false;

    async function stamp() {
      const response = await fetch(filePath);
      const originalBytes = await response.arrayBuffer();

      const doc = await PDF.load(new Uint8Array(originalBytes));
      const textWidth = measureText(stampText, STAMP_FONT, STAMP_SIZE);

      for (const page of doc.getPages()) {
        page.drawText(stampText, {
          x: page.width - textWidth - 50,
          y: page.height - 25,
          size: STAMP_SIZE,
          font: STAMP_FONT,
          color: rgb(0.8, 0, 0),
        });
      }

      /**
       * Rewrites the whole file, which has two consequences worth knowing.
       *
       * **Attachments survive.** Embedded files and RichMedia assets are part
       * of the object graph, so they are written back out untouched —
       * verified against all three audio fixtures. That matters because with
       * the stamp on, the viewer and the attachment listing both read this
       * copy rather than the original.
       *
       * **Linearisation does not.** A linearised PDF puts page 1's objects at
       * the front with hint tables, so a reader can render the first page from
       * the opening bytes. Saving here produces the ordinary layout instead —
       * xref at the end, objects wherever the writer put them:
       *
       *     original  /Linearized: true
       *     stamped   /Linearized: false     (the file also shrank by 158 KB)
       *
       * Harmless today, because nothing requests byte ranges and this copy is
       * a Blob already held in memory. It matters the moment progressive
       * loading is attempted: stamping would silently undo it, and neither
       * @libpdf/core nor pdf-lib can write a linearised file to put it back.
       * `qpdf --linearize` can, which is one more reason the stamp belongs on
       * a server — stamp, strip the attachment, re-linearise, serve.
       *
       * Size growth is not a concern: about 310 bytes per stamp, constant, and
       * independent of file size. The audio is not recompressed.
       */
      const stampedBytes = await doc.save();
      const blob = new Blob([stampedBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      if (cancelled) {
        // The cleanup already ran and saw nothing, so nothing else will
        // revoke this one.
        URL.revokeObjectURL(url);
        return;
      }

      created = url;
      setStampedUrl(url);
    }

    stamp().catch((error: unknown) => {
      // A file that fails to fetch or parse should leave the viewer on the
      // unstamped original, not take the page down with an unhandled
      // rejection. activePdfPath already falls back to filePath.
      console.error('Could not stamp the document:', error);
    });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
      // Dropping it here keeps activePdfPath from pointing at a revoked URL
      // while the next stamp is still rendering.
      setStampedUrl(null);
    };
  }, [showStamp, filePath, stampText]);

  const activePdfPath = showStamp && stampedUrl ? stampedUrl : filePath;

  return {
    showStamp,
    toggleStamp,
    activePdfPath,
  };
}
