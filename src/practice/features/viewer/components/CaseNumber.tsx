// Practice copy of CaseNumber from the other project, rebuilt from a photo of
// its source. Only here to test against. One fix from the original:
// hasMultipleCases was `> 0`, which gave a single case a one-option dropdown.
import { useCallback } from 'react';
import { DropDownList, Label, Tooltip } from '@progress/kendo-react-all';
import type { DropDownListChangeEvent } from '@progress/kendo-react-all';
import { SvgIcon } from '@progress/kendo-react-common';
import { infoCircleIcon } from '@progress/kendo-svg-icons';
import '@progress/kendo-theme-default/dist/all.css';

const CASE_CHANGE_INFO = 'Selecting a new case number will refresh all document details.';

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
      {/* Label and info icon on one row (see global.css) */}
      <div className="case-number-heading">
        <Label>
          <strong>Case Number</strong>
        </Label>

        {/* Only when there is a choice to make. Kendo's Tooltip shows the
            title text to the left of the icon, as the main project's
            CaseSelector does, on hover or keyboard focus (tabIndex puts the
            icon in the tab order). parentTitle because the mouse lands on the
            svg inside, not on the span with the title. aria-label gives
            screen readers the same text. */}
        {hasMultipleCases && (
          <Tooltip
            anchorElement="target"
            position="left"
            parentTitle
            showOption={{ hover: true, focus: true }}
          >
            <span tabIndex={0} title={CASE_CHANGE_INFO} aria-label={CASE_CHANGE_INFO} role="img">
              <SvgIcon icon={infoCircleIcon} />
            </span>
          </Tooltip>
        )}
      </div>

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
