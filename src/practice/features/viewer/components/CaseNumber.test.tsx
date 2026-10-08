import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CaseNumber from './CaseNumber';

/**
 * Tests for the case number picker.
 *
 * The real KendoReact DropDownList renders fine in jsdom, so it is not mocked.
 * Kendo's own keyboard handling and ARIA are Telerik's to test; what is ours is
 * the glue: which item shows as selected, which string reaches the parent, the
 * placeholder guard, and the fallback when there is nothing to choose between.
 */

const PLACEHOLDER = 'Please select a case number';

const cases = [{ caseNumber: 'CASE-2026-001' }, { caseNumber: 'CASE-2026-002' }, { caseNumber: 'CASE-2026-003' }];

/** Render with sensible defaults; each test overrides what it cares about. */
function renderCaseNumber(props: Partial<React.ComponentProps<typeof CaseNumber>> = {}) {
  const onSelectCase = vi.fn();
  const user = userEvent.setup();

  render(<CaseNumber cases={cases} selectedCaseNumber={null} onSelectCase={onSelectCase} {...props} />);

  return { user, onSelectCase };
}

describe('CaseNumber', () => {
  // Unmount after each test, or every render piles onto the same page and
  // queries start finding several dropdowns.
  afterEach(() => {
    cleanup();
  });

  it('always shows the Case Number label', () => {
    renderCaseNumber();

    expect(screen.getByText('Case Number')).toBeInTheDocument();
  });

  describe('with cases to choose from', () => {
    it('shows a dropdown named for a screen reader', () => {
      // Kendo does not name the control on its own. Without ariaLabel a
      // screen reader announces only "combobox".
      renderCaseNumber();

      expect(screen.getByRole('combobox', { name: 'Select case number' })).toBeInTheDocument();
    });

    it('shows the placeholder when no case is selected', () => {
      renderCaseNumber();

      expect(screen.getByRole('combobox')).toHaveTextContent(PLACEHOLDER);
    });

    it('shows the selected case', () => {
      renderCaseNumber({ selectedCaseNumber: 'CASE-2026-002' });

      expect(screen.getByRole('combobox')).toHaveTextContent('CASE-2026-002');
    });

    it('falls back to the placeholder for a case number not in the list', () => {
      // A stale selection, e.g. a case no longer returned, must not leave the
      // control blank.
      renderCaseNumber({ selectedCaseNumber: 'CASE-1999-999' });

      expect(screen.getByRole('combobox')).toHaveTextContent(PLACEHOLDER);
    });

    it('lists every case', async () => {
      const { user } = renderCaseNumber();

      await user.click(screen.getByRole('combobox'));

      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
        'CASE-2026-001',
        'CASE-2026-002',
        'CASE-2026-003',
      ]);
    });
  });

  describe('selecting', () => {
    it('reports the chosen case number to the parent', async () => {
      const { user, onSelectCase } = renderCaseNumber();

      await user.click(screen.getByRole('combobox'));
      await user.click(screen.getByRole('option', { name: 'CASE-2026-003' }));

      // The case number string, not the whole item Kendo hands back.
      expect(onSelectCase).toHaveBeenCalledWith('CASE-2026-003');
    });

    it('ignores the placeholder when it is picked', async () => {
      // Kendo lists the placeholder as a clickable row. The guard against it
      // compares against a copy of the placeholder text, so this also catches
      // the two strings drifting apart. Starts on a real case because Kendo
      // fires no change when the current value is picked again.
      const { user, onSelectCase } = renderCaseNumber({ selectedCaseNumber: 'CASE-2026-002' });

      await user.click(screen.getByRole('combobox'));

      // Found by Kendo's class, not by text: some Kendo versions put the
      // placeholder text on the page more than once, so the text alone does
      // not say which one is the row in the list.
      const placeholderRow = document.querySelector('.k-list-optionlabel');
      expect(placeholderRow).toHaveTextContent(PLACEHOLDER);
      await user.click(placeholderRow!);

      expect(onSelectCase).not.toHaveBeenCalled();
    });
  });

  describe('with nothing to choose between', () => {
    it('shows a single case as text, not a one-option dropdown', () => {
      renderCaseNumber({ cases: [{ caseNumber: 'CASE-2026-001' }], selectedCaseNumber: 'CASE-2026-001' });

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.getByText('CASE-2026-001')).toBeInTheDocument();
    });

    // null, undefined and [] all mean "nothing to pick", and each takes a
    // different path through `cases && cases.length > 1`. With no cases there
    // is nothing selected either, so selectedCaseNumber is null too.
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['an empty list', []],
    ])('shows no dropdown and does not crash when cases is %s', (_label, noCases) => {
      renderCaseNumber({ cases: noCases, selectedCaseNumber: null });

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.getByText('Case Number')).toBeInTheDocument();
    });
  });
});
