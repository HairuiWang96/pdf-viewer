import { useCallback, useState } from 'react';
import type { PdfMetadata } from '../types';
import pdfMetadata from '../data/pdf-metadata.json';

/**
 * Manages which case is selected and whether the stamp version is active.
 *
 * No case is selected by default — the user must pick one from the dropdown.
 * Before selection:
 * - The PDF shows the default file (without stamp).
 * - Document details are hidden (metadata is null).
 *
 * After selection:
 * - Document details populate with the selected case's metadata.
 * - Stamp toggle becomes available.
 * - Changing the case resets the stamp toggle back to OFF.
 *
 * Single case:
 * - No dropdown needed — the only case is auto-selected.
 * - Stamp defaults to ON (with stamp).
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

  // Single case → stamp on by default; multiple cases → stamp off by default
  const [showStamp, setShowStamp] = useState(!hasMultipleCases);

  // null when no case is selected yet (multiple cases, before user picks one)
  const metadata = selectedCaseId
    ? (allCases.find((c) => c.id === selectedCaseId) ?? null)
    : null;

  const toggleStamp = useCallback((stamped: boolean) => {
    setShowStamp(stamped);
  }, []);

  // When the user picks a case number, update the selection
  // and reset the stamp toggle so they start fresh with the new case.
  const selectCase = useCallback((caseId: string) => {
    setSelectedCaseId(caseId);
    setShowStamp(false);
  }, []);

  // Default PDF: show the first case's file (without stamp) before any selection.
  // After selection: show the selected case's file, stamped or not.
  const defaultPdfPath = allCases[0].filePath;
  const activePdfPath = metadata
    ? (showStamp ? metadata.stampedFilePath : metadata.filePath)
    : defaultPdfPath;

  return {
    allCases,
    hasMultipleCases,
    metadata,
    selectedCaseId,
    selectCase,
    showStamp,
    toggleStamp,
    activePdfPath,
  };
}
