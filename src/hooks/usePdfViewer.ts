import { useCallback, useState } from 'react';
import type { PdfMetadata } from '../types';
import pdfMetadata from '../data/pdf-metadata.json';

/**
 * Manages which case is selected and whether the stamp version is active.
 *
 * Behavior depends on how many cases exist:
 *
 * Single case:
 * - No dropdown needed — the only case is auto-selected.
 * - Stamp defaults to ON (with stamp).
 * - Document details are visible immediately.
 *
 * Multiple cases:
 * - Dropdown is shown so the user can pick a case number.
 * - Stamp defaults to OFF (without stamp).
 * - Changing the case resets the stamp toggle back to OFF.
 */
export default function usePdfViewer() {
  // `pdfMetadata` is imported from a JSON file. TypeScript doesn't automatically
  // know the shape of JSON imports, so we use `as PdfMetadata[]` (a type assertion)
  // to tell TypeScript "this data matches our PdfMetadata interface." This gives us
  // autocomplete and type checking on fields like caseNumber, title, etc.
  const allCases: PdfMetadata[] = pdfMetadata as PdfMetadata[];
  const hasMultipleCases = allCases.length > 1;

  // Default to the first case in the array
  const [selectedCaseId, setSelectedCaseId] = useState(allCases[0].id);

  // Single case → stamp on by default; multiple cases → stamp off by default
  const [showStamp, setShowStamp] = useState(!hasMultipleCases);

  // Find the metadata for whichever case is currently selected
  const metadata = allCases.find((c) => c.id === selectedCaseId) ?? allCases[0];

  const toggleStamp = useCallback((stamped: boolean) => {
    setShowStamp(stamped);
  }, []);

  // When the user picks a different case number, update the selection
  // and reset the stamp toggle so they start fresh with the new case.
  const selectCase = useCallback((caseId: string) => {
    setSelectedCaseId(caseId);
    setShowStamp(false);
  }, []);

  const activePdfPath = showStamp ? metadata.stampedFilePath : metadata.filePath;

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
