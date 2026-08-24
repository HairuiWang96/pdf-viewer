import type { PdfMetadata } from '../types';
import pdfMetadata from '../data/pdf-metadata.json';

export default function usePdfViewer() {
  const metadata: PdfMetadata = pdfMetadata[0];

  return {
    metadata,
  };
}
