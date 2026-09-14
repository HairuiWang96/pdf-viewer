import { useCallback, useEffect, useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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

      const doc = await PDFDocument.load(originalBytes);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);

      for (const page of doc.getPages()) {
        const { width } = page.getSize();
        const textWidth = font.widthOfTextAtSize(stampText, 10);

        page.drawText(stampText, {
          x: width - textWidth - 50,
          y: page.getHeight() - 25,
          size: 10,
          font,
          color: rgb(0.8, 0, 0),
        });
      }

      const stampedBytes = await doc.save();
      const blob = new Blob([stampedBytes as unknown as ArrayBuffer], { type: 'application/pdf' });
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
