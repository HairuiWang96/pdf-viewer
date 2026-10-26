// Practice copy of CaseNumber from the other project, rebuilt from a photo of
// its source. Only here to test against. One fix from the original:
// hasMultipleCases was `> 0`, which gave a single case a one-option dropdown.
//
// Changed since (proposed, not in doc-viewer yet): more than ten cases get a
// ComboBox you can type in to filter, instead of the DropDownList.
import { useCallback, useState } from 'react';
import { ComboBox, DropDownList, Label, Tooltip } from '@progress/kendo-react-all';
import type {
  ComboBoxChangeEvent,
  ComboBoxFilterChangeEvent,
  DropDownListChangeEvent,
} from '@progress/kendo-react-all';
import { SvgIcon } from '@progress/kendo-react-common';
import { infoCircleIcon } from '@progress/kendo-svg-icons';
import '@progress/kendo-theme-default/dist/all.css';

const CASE_CHANGE_INFO = 'Selecting a new case number will refresh all document details.';

// Above this many cases, a list is long to scroll: switch to a ComboBox,
// where typing part of a case number narrows the list
const MAX_DROPDOWN_CASES = 10;

interface DropDownListProps {
  cases?: { caseNumber?: string }[] | null;
  selectedCaseNumber: string | null;
  onSelectCase?: (selectedCase: string) => Promise<void>;
}

export default function CaseNumber({ cases, selectedCaseNumber, onSelectCase }: DropDownListProps) {
  // No list (null/undefined) is the same as an empty one
  const caseList = cases ?? [];
  const hasMultipleCases = caseList.length > 1;
  const showComboBox = caseList.length > MAX_DROPDOWN_CASES;

  // What the user has typed into the ComboBox; the list shows only the case
  // numbers containing it ("912" finds 2026-CR-00912)
  const [filter, setFilter] = useState('');
  const filteredCases = caseList.filter((c) =>
    (c.caseNumber ?? '').toLowerCase().includes(filter.toLowerCase()),
  );

  const handleComboBoxChange = useCallback(
    (e: ComboBoxChangeEvent) => {
      // null when the typed text matches no case: keep the current case
      const selected = e.value as { caseNumber?: string } | null;
      if (selected?.caseNumber && onSelectCase) void onSelectCase(selected.caseNumber);
    },
    [onSelectCase],
  );

  const handleDropDownChange = useCallback(
    (e: DropDownListChangeEvent) => {
      const selected = e.target.value as { caseNumber?: string };
      if (
        selected?.caseNumber &&
        selected.caseNumber !== 'Please select a case number' &&
        onSelectCase
      )
        void onSelectCase(selected.caseNumber);
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

        {/* Info icon, only when there is a choice to make. Three layers:
              <Tooltip>  watches what is inside it; on hover or focus it
                         shows the title text in a box
                <span>   carries what the icon needs: the text (title),
                         Tab focus, screen-reader text, the CSS class.
                         Easier on a plain span than on Kendo's SvgIcon.
                  <svg>  the icon itself, where the mouse actually lands
            Flow: hover or Tab onto the span → Kendo reads its title → shows
            it to the left. */}
        {hasMultipleCases && (
          <Tooltip
            // What the box sticks to. "target": the element hovered (the
            // icon), so the box sits beside it and stays put. "pointer": the
            // mouse cursor, so the box follows the cursor around. "target"
            // also works for Tab, where there is no cursor to stick to.
            anchorElement="target"
            // To the left of the icon, as the main project's CaseSelector does
            position="left"
            // The mouse lands on the svg, which has no title; look up to its
            // parent (the span) for one. Without it, hovering shows nothing.
            parentTitle
            // Show on mouse hover, and on keyboard focus for keyboard users
            showOption={{ hover: true, focus: true }}
          >
            <span
              // display: flex, so the icon is centred with the label (global.css)
              className="case-number-info"
              // A span can't take focus by default; 0 puts it in the Tab order,
              // so the focus option above can trigger
              tabIndex={0}
              // The tooltip's text. Kendo reads it from here and shows it in
              // its own box instead of the browser's plain one.
              title={CASE_CHANGE_INFO}
              // What a screen reader reads aloud: the icon has no words
              aria-label={CASE_CHANGE_INFO}
              // Announce it as a picture; an empty span means nothing to a
              // screen reader
              role="img"
            >
              {/* Kendo's icon component: the "i" in a circle */}
              <SvgIcon icon={infoCircleIcon} />
            </span>
          </Tooltip>
        )}
      </div>

      {showComboBox ? (
        <ComboBox
          data={filteredCases}
          textField="caseNumber"
          dataItemKey="caseNumber"
          value={selectedCase}
          onChange={handleComboBoxChange}
          filterable
          onFilterChange={(e: ComboBoxFilterChangeEvent) => setFilter(String(e.filter.value ?? ''))}
          // Show the whole list next time. Picking a case closes the list too,
          // so this covers both; leaving the box, Kendo clears it itself.
          onClose={() => setFilter('')}
          placeholder="Please select a case number"
          // A case must stay selected, so there is nothing to clear
          clearButton={false}
          ariaLabel="Select case number"
        />
      ) : hasMultipleCases ? (
        <DropDownList
          data={caseList}
          textField="caseNumber"
          dataItemKey="caseNumber"
          value={selectedCase}
          onChange={handleDropDownChange}
          defaultItem={{ id: null, caseNumber: 'Please select a case number' }}
          ariaLabel="Select case number"
        />
      ) : (
        <p>{selectedCaseNumber}</p>
      )}
    </div>
  );
}
