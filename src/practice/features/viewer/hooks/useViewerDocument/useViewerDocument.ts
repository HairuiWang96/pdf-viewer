import { useEffect, useState } from 'react';
import { useAttachments } from './useAttachments';
import type { PDFBytesSource } from '../../types/attachments';

export function useViewerDocument(pdfUrl: string | undefined) {
  const [pdfDocument, setPdfDocument] = useState<PDFBytesSource | null>(null);

  const handleClearPDFChange = () => {
    setPdfDocument(null);
  };

  useEffect(() => {
    function clearPDF() {
      handleClearPDFChange();
    }

    clearPDF();
  }, [pdfUrl]);

  const { attachments, readAttachment } = useAttachments(pdfDocument);

  return { attachments, onDocumentLoad: setPdfDocument, readAttachment };
}
