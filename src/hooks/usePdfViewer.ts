import { useCallback, useState } from 'react';
import type { PdfMetadata } from '../types';
import pdfMetadata from '../data/pdf-metadata.json';

export default function usePdfViewer() {
  const [showStamp, setShowStamp] = useState(false);
  const metadata: PdfMetadata = pdfMetadata[0];

  const toggleStamp = useCallback((stamped: boolean) => {
    setShowStamp(stamped);
  }, []);

  const activePdfPath = showStamp ? metadata.stampedFilePath : metadata.filePath;

  return {
    metadata,
    showStamp,
    toggleStamp,
    activePdfPath,
  };
}
