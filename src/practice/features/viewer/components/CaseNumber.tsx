// Practice copy of CaseNumber from the other project, rebuilt from a photo of
// its source. Only here to test against. One fix from the original:
// hasMultipleCases was `> 0`, which gave a single case a one-option dropdown.
import { useCallback } from 'react';
import { DropDownList, Label } from '@progress/kendo-react-all';
import type { DropDownListChangeEvent } from '@progress/kendo-react-all';
import '@progress/kendo-theme-default/dist/all.css';

interface DropDownListProps {
  cases?: { caseNumber?: string }[] | null;
  selectedCaseNumber: string | null;
  onSelectCase: (selectedCase: string) => void;
}

export default function CaseNumber({ cases, selectedCaseNumber, onSelectCase }: DropDownListProps) {
  const hasMultipleCases = cases && cases.length > 1;

  const handleChange = useCallback(
    (e: DropDownListChangeEvent) => {
      const selected = e.target.value as { caseNumber?: string };
      if (selected?.caseNumber && selected.caseNumber !== 'Please select a case number')
        onSelectCase(selected.caseNumber);
    },
    [onSelectCase],
  );

  let selectedCase: { caseNumber?: string } | null = null;
  if (cases && cases.length > 0) {
    selectedCase = selectedCaseNumber
      ? (cases.find((c) => c.caseNumber === selectedCaseNumber) ?? null)
      : null;
  }

  return (
    <div>
      <Label>
        <strong>Case Number</strong>
      </Label>

      {hasMultipleCases ? (
        <DropDownList
          data={cases}
          textField="caseNumber"
          dataItemKey="caseNumber"
          value={selectedCase}
          onChange={handleChange}
          defaultItem={{ id: null, caseNumber: 'Please select a case number' }}
          ariaLabel="Select case number"
        />
      ) : (
        <p>{selectedCaseNumber}</p>
      )}
    </div>
  );
}
