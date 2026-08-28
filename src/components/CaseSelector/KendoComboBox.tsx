import { useCallback } from 'react';
import { ComboBox } from '@progress/kendo-react-dropdowns';
import type { ComboBoxChangeEvent } from '@progress/kendo-react-dropdowns';
import type { PdfMetadata } from '../../types';
import '@progress/kendo-theme-default/dist/all.css';

interface KendoComboBoxProps {
  cases: PdfMetadata[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string) => void;
}

/**
 * Solution 3: KendoReact ComboBox (premium, requires license).
 *
 * Pros:
 *   - Proper placeholder text (greyed out, not selectable)
 *   - Built-in keyboard navigation and ARIA attributes
 *   - Minimal code (~30 lines vs ~150 for custom)
 *   - Supports filtering/search for large lists (premium feature)
 *
 * Cons:
 *   - Requires a paid KendoReact license
 *   - Allows typing in the input (not purely click-to-select)
 *   - Less control over styling (Kendo theme overrides)
 *   - Adds ~730 KB CSS from kendo-theme-default
 */
export default function KendoComboBox({
  cases,
  selectedCaseId,
  onSelectCase,
}: KendoComboBoxProps) {
  const selectedCase = cases.find((c) => c.id === selectedCaseId) ?? null;

  const handleChange = useCallback((e: ComboBoxChangeEvent) => {
    const selected = e.target.value as PdfMetadata | null;
    if (selected) onSelectCase(selected.id);
  }, [onSelectCase]);

  return (
    <ComboBox
      data={cases}
      textField="caseNumber"
      dataItemKey="id"
      value={selectedCase}
      onChange={handleChange}
      placeholder="Please select a case number"
      clearButton={false}
    />
  );
}
