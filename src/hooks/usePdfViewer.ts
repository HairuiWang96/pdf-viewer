import { useCallback, useState } from 'react';
import type { PdfMetadata } from '../types';
import { INITIAL_PAGE } from '../constants';
import pdfMetadata from '../data/pdf-metadata.json';

export default function usePdfViewer() {
  const [currentPage, setCurrentPage] = useState(INITIAL_PAGE);
  const [totalPages, setTotalPages] = useState(0);

  const metadata: PdfMetadata = pdfMetadata[0];

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleLoadSuccess = useCallback((numPages: number) => {
    setTotalPages(numPages);
  }, []);

  return {
    currentPage,
    totalPages,
    metadata,
    handlePageChange,
    handleLoadSuccess,
  };
}
