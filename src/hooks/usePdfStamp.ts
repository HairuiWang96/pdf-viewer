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
    if (!showStamp) {
      setStampedUrl(null);
      return;
    }

    let revoked = false;

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

      if (!revoked) {
        setStampedUrl(url);
      } else {
        URL.revokeObjectURL(url);
      }
    }

    stamp();

    return () => {
      revoked = true;
      if (stampedUrl) {
        URL.revokeObjectURL(stampedUrl);
      }
    };
  }, [showStamp, filePath, stampText]);

  const activePdfPath = showStamp && stampedUrl ? stampedUrl : filePath;

  return {
    showStamp,
    toggleStamp,
    activePdfPath,
  };
}
