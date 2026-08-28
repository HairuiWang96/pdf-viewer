import { useCallback } from 'react';
import { DropDownList } from '@progress/kendo-react-dropdowns';
import type { DropDownListChangeEvent } from '@progress/kendo-react-dropdowns';
import type { PdfMetadata } from '../../types';
import '@progress/kendo-theme-default/dist/all.css';

interface KendoDropDownListProps {
  cases: PdfMetadata[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string) => void;
}

/**
 * Solution 2: KendoReact DropDownList (free, no license required).
 *
 * Pros:
 *   - No license needed — free for production use
 *   - Built-in keyboard navigation and ARIA attributes
 *   - Minimal code (~30 lines vs ~150 for custom)
 *   - Professional styling via kendo-theme-default
 *
 * Cons:
 *   - "Please select a case number" appears as a selectable item in the list
 *     (defaultItem is not a true placeholder — it's an option)
 *   - Less control over styling (Kendo theme overrides)
 *   - Adds ~730 KB CSS from kendo-theme-default
 */
export default function KendoDropDownList({
  cases,
  selectedCaseId,
  onSelectCase,
}: KendoDropDownListProps) {
  const selectedCase = cases.find((c) => c.id === selectedCaseId) ?? null;

  const handleChange = useCallback((e: DropDownListChangeEvent) => {
    const selected = e.target.value as PdfMetadata;
    if (selected.id) onSelectCase(selected.id);
  }, [onSelectCase]);

  return (
    <DropDownList
      data={cases}
      textField="caseNumber"
      dataItemKey="id"
      value={selectedCase}
      onChange={handleChange}
      defaultItem={{ id: null, caseNumber: 'Please select a case number' }}
    />
  );
}
