import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CaseNumber from './CaseNumber';

/**
 * Tests for the case number picker.
 *
 * The real KendoReact DropDownList and ComboBox render fine in jsdom, so they
 * are not mocked. Kendo's own keyboard handling and ARIA are Telerik's to test;
 * what is ours is the glue: which control shows, which item shows as selected,
 * which string reaches the parent, the placeholder guard, the ComboBox's
 * filter, and the fallback when there is nothing to choose between.
 *
 * getByRole('combobox') finds either control. "combobox" is the ARIA role,
 * the standard name screen readers use for any control that opens a list to
 * choose from, and Kendo gives it to both. It does not mean Kendo's ComboBox:
 *   2–10 cases       → DropDownList (role "combobox")
 *   more than 10     → ComboBox     (role "combobox", and you can type in it)
 */

const PLACEHOLDER = 'Please select a case number';

// A few cases: the usual document, shown with the dropdown list. Fixed values,
// so tests can name them.
const cases = [{ caseNumber: 'CASE-2026-001' }, { caseNumber: 'CASE-2026-002' }, { caseNumber: 'CASE-2026-003' }];

// Any number of cases, for tests where the count matters (10 vs 11).
// CASE-01 … CASE-NN, so typing "1" matches several and "11" just one.
const manyCases = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ caseNumber: `CASE-${String(i + 1).padStart(2, '0')}` }));

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

  describe('with 2–10 cases: the dropdown list', () => {
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

  describe('info icon', () => {
    const INFO = 'Selecting a new case number will refresh all document details.';

    it('shows the info icon when there are several cases', () => {
      renderCaseNumber();

      expect(screen.getByRole('img', { name: INFO })).toBeInTheDocument();
    });

    it('shows the info text on hover', async () => {
      const { user } = renderCaseNumber();

      // The svg, not the span: that is where a real mouse lands, and it has
      // no title of its own
      await user.hover(screen.getByRole('img', { name: INFO }).querySelector('svg')!);

      // Kendo's tooltip popup, not the icon's own label
      expect(await screen.findByRole('tooltip')).toHaveTextContent(INFO);
    });

    it('shows the info text on keyboard focus too', async () => {
      // The main project's CaseSelector does the same: Tab reaches the icon,
      // so keyboard users can read the text without a mouse.
      const { user } = renderCaseNumber();

      await user.tab();
      expect(screen.getByRole('img', { name: INFO })).toHaveFocus();

      expect(await screen.findByRole('tooltip')).toHaveTextContent(INFO);
    });

    // it.each runs the same test once per row, so this is two tests without
    // copying the body. Each row's values become the function's arguments:
    // _label is only used in the name (the _ means "not used in the body"),
    // someCases is passed in as `cases`.
    //
    // %s in the name is filled from the row, in order: the 1st %s gets the
    // 1st value, a 2nd %s would get the 2nd. With one %s, the label fills it,
    // which is why it comes first in each row. The two tests are named
    //   "shows no info icon with one case"
    //   "shows no info icon with no cases"
    // Other placeholders: %d a number, %o an object or list printed out,
    // %# the row's position (0, 1, …).
    it.each([
      ['one case', [{ caseNumber: 'CASE-2026-001' }]],
      ['no cases', null],
    ])('shows no info icon with %s', (_label, someCases) => {
      renderCaseNumber({ cases: someCases, selectedCaseNumber: null });

      expect(screen.queryByRole('img', { name: INFO })).not.toBeInTheDocument();
    });
  });

  describe('selecting from the dropdown list', () => {
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

  describe('with more than 10 cases: the combo box', () => {
    // Both controls have the combobox role; only the ComboBox is a text box
    // you can type in, so an <input> tells them apart
    const isTypeable = () => screen.getByRole('combobox', { name: 'Select case number' }).tagName === 'INPUT';

    it('keeps the dropdown list at exactly ten cases', () => {
      renderCaseNumber({ cases: manyCases(10) });

      expect(isTypeable()).toBe(false);
    });

    it('switches to a combo box above ten cases', () => {
      renderCaseNumber({ cases: manyCases(11) });

      expect(isTypeable()).toBe(true);
      expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', PLACEHOLDER);
    });

    it('narrows the list to the case numbers containing what is typed', async () => {
      const { user } = renderCaseNumber({ cases: manyCases(12) });

      await user.type(screen.getByRole('combobox'), '1');

      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
        'CASE-01',
        'CASE-10',
        'CASE-11',
        'CASE-12',
      ]);
    });

    it('reports the case picked from the narrowed list', async () => {
      const { user, onSelectCase } = renderCaseNumber({ cases: manyCases(12) });

      await user.type(screen.getByRole('combobox'), '11');
      await user.click(screen.getByRole('option', { name: 'CASE-11' }));

      expect(onSelectCase).toHaveBeenCalledWith('CASE-11');
    });

    it('shows the selected case in the box', () => {
      renderCaseNumber({ cases: manyCases(12), selectedCaseNumber: 'CASE-07' });

      expect(screen.getByRole('combobox')).toHaveValue('CASE-07');
    });

    it('shows an empty box for a selected case not in the list', () => {
      // A stale selection must not show a number that is not one of the cases
      renderCaseNumber({ cases: manyCases(12), selectedCaseNumber: 'CASE-99' });

      expect(screen.getByRole('combobox')).toHaveValue('');
    });

    it('ignores upper and lower case when narrowing', async () => {
      // People type in lowercase; the case numbers are in capitals
      const { user } = renderCaseNumber({ cases: manyCases(12) });

      await user.type(screen.getByRole('combobox'), 'case-1');

      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
        'CASE-10',
        'CASE-11',
        'CASE-12',
      ]);
    });

    it('shows the full list again after a case is picked', async () => {
      // Picking closes the list, which clears what was typed. (Leaving the box
      // without picking needs no test of ours: Kendo clears it itself then.)
      const { user } = renderCaseNumber({ cases: manyCases(12) });
      await user.type(screen.getByRole('combobox'), '11');
      await user.click(screen.getByRole('option', { name: 'CASE-11' }));

      // The arrow button beside the box. Kendo names it "expand combobox"
      // while the list is closed ("collapse combobox" while open).
      await user.click(screen.getByRole('button', { name: 'expand combobox' }));

      expect(screen.getAllByRole('option')).toHaveLength(12);
    });
  });

  describe('with no onSelectCase', () => {
    // The prop is optional, so picking must not call a missing function. An
    // error thrown in a click handler doesn't reach the test: React reports it
    // to the window instead. So these collect what reaches the window.
    // Starts empty so TypeScript sees a value (it can't tell beforeEach runs
    // first); beforeEach still empties it before every test
    let errors: unknown[] = [];
    const collect = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault(); // handled here, so not reported again
    };

    beforeEach(() => {
      errors = [];
      window.addEventListener('error', collect);
    });

    afterEach(() => {
      window.removeEventListener('error', collect);
    });

    it('picks from the dropdown without an error', async () => {
      const { user } = renderCaseNumber({ onSelectCase: undefined });

      await user.click(screen.getByRole('combobox'));
      await user.click(screen.getByRole('option', { name: 'CASE-2026-003' }));

      expect(errors).toEqual([]);
    });

    it('picks from the combo box without an error', async () => {
      const { user } = renderCaseNumber({ cases: manyCases(11), onSelectCase: undefined });

      await user.type(screen.getByRole('combobox'), '11');
      await user.click(screen.getByRole('option', { name: 'CASE-11' }));

      expect(errors).toEqual([]);
    });
  });

  describe('with nothing to choose between', () => {
    it('shows a single case as text, not a one-option dropdown', () => {
      renderCaseNumber({ cases: [{ caseNumber: 'CASE-2026-001' }], selectedCaseNumber: 'CASE-2026-001' });

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.getByText('CASE-2026-001')).toBeInTheDocument();
    });

    // null, undefined and [] all mean "nothing to pick". The component turns
    // null and undefined into [] (`cases ?? []`); these check each one gets
    // there without crashing. With no cases there is nothing selected either,
    // so selectedCaseNumber is null too. (it.each and %s: see the info icon
    // tests above.)
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
