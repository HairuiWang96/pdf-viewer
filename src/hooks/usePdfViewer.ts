import { useCallback, useState } from 'react';
import type { PdfMetadata } from '../types';
import { INITIAL_PAGE } from '../constants';
import pdfMetadata from '../data/pdf-metadata.json';

/**
 * Manages which case is selected, page navigation, and total pages.
 *
 * Behavior depends on how many cases exist:
 *
 * Multiple cases:
 * - No case is selected by default — the dropdown shows a placeholder and
 *   the user must pick one.
 * - Before selection: the viewer shows the default PDF and document details
 *   are hidden (metadata is null).
 * - After selection: details populate and the stamp toggle becomes available.
 * - Changing the case resets the stamp toggle back to OFF and resets page
 *   navigation back to page 1.
 *
 * Single case:
 * - No dropdown needed — the only case is auto-selected.
 * - Stamp defaults to ON (with stamp).
 * - Document details are visible immediately.
 */
export default function usePdfViewer() {
  // `pdfMetadata` is imported from a JSON file. TypeScript doesn't automatically
  // know the shape of JSON imports, so we use `as PdfMetadata[]` (a type assertion)
  // to tell TypeScript "this data matches our PdfMetadata interface." This gives us
  // autocomplete and type checking on fields like caseNumber, title, etc.
  const allCases: PdfMetadata[] = pdfMetadata as PdfMetadata[];
  const hasMultipleCases = allCases.length > 1;

  // Single case → auto-select it; multiple cases → no default selection
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(
    hasMultipleCases ? null : allCases[0].id,
  );
  const [currentPage, setCurrentPage] = useState(INITIAL_PAGE);
  const [totalPages, setTotalPages] = useState(0);
  // Bumped on every selection so the stamp toggle can tell "the user picked a
  // case" apart from "the file happens to be the same one as before".
  const [selectionCount, setSelectionCount] = useState(0);

  // null when no case is selected yet (multiple cases, before the user picks one)
  const metadata = selectedCaseId
    ? (allCases.find((c) => c.id === selectedCaseId) ?? null)
    : null;

  // Before any selection the viewer still needs something to render, so it
  // falls back to the first case's file.
  const filePath = metadata?.filePath ?? allCases[0].filePath;
  const fileName = metadata?.fileName ?? allCases[0].fileName;
  const stampText = metadata?.stampText ?? '';

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleLoadSuccess = useCallback((numPages: number) => {
    setTotalPages(numPages);
  }, []);

  // When the user picks a different case number, update the selection
  // and reset page navigation back to page 1.
  const selectCase = useCallback((caseId: string) => {
    setSelectedCaseId(caseId);
    setCurrentPage(INITIAL_PAGE);
    setTotalPages(0);
    setSelectionCount((count) => count + 1);
  }, []);

  return {
    allCases,
    hasMultipleCases,
    metadata,
    filePath,
    fileName,
    stampText,
    selectedCaseId,
    selectCase,
    selectionCount,
    currentPage,
    totalPages,
    handlePageChange,
    handleLoadSuccess,
  };
}
