import { useCallback, useEffect, useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export default function usePdfStamp(filePath: string, stampText: string) {
  const [showStamp, setShowStamp] = useState(false);
  const [stampedUrl, setStampedUrl] = useState<string | null>(null);

  const toggleStamp = useCallback((stamped: boolean) => {
    setShowStamp(stamped);
  }, []);

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
