// Practice copy of doc-viewer's test/features/viewer/components/CaseNumber.test.tsx.
// Changed from the original: the import path (the test sits next to the
// component here). Proposed, not in doc-viewer yet: the review changes (the
// wording fixes, the two-case test, the cleared-text test).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CaseNumber from './CaseNumber';

/**
 * Tests for the case number picker.
 *
 * The real KendoReact ComboBox renders fine in jsdom, so it is not mocked.
 * Kendo's own keyboard handling and ARIA are Telerik's to test; what is ours is the glue:
 * when the ComboBox shows, which case shows as selected, which string reaches the parent,
 * the ComboBox's filter, ignoring a cleared box, and the fallback when there is nothing
 * to choose between.
 */

const PLACEHOLDER = 'Select a case number';

const cases = [
  { caseNumber: 'CASE-2026-001' },
  { caseNumber: 'CASE-2026-002' },
  { caseNumber: 'CASE-2026-003' },
];

// Any number of cases, CASE-01 … CASE-NN, so typing "1" matches several and
// "11" just one.
const manyCases = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    caseNumber: `CASE-${String(i + 1).padStart(2, '0')}`,
  }));

// Render with sensible defaults; each test overrides what it cares about.
function renderCaseNumber(props: Partial<React.ComponentProps<typeof CaseNumber>> = {}) {
  const onSelectCase = vi.fn();
  const user = userEvent.setup();

  render(
    <CaseNumber cases={cases} selectedCaseNumber={null} onSelectCase={onSelectCase} {...props} />,
  );

  return { user, onSelectCase };
}

describe('CaseNumber', () => {
  // Unmount after each test.
  afterEach(() => {
    cleanup();
  });

  it('always shows the Case Number label', () => {
    renderCaseNumber();

    expect(screen.getByText('Case Number')).toBeInTheDocument();
  });

  describe('info icon', () => {
    const INFO = 'Selecting a new case number will refresh all document details.';

    it('shows the info icon when there are several cases', () => {
      renderCaseNumber();

      expect(screen.getByRole('img', { name: INFO })).toBeInTheDocument();
    });

    it('shows the info text on hover', async () => {
      const { user } = renderCaseNumber();

      // The svg, not the span: that is where a real mouse lands, and it has no title of its own
      await user.hover(screen.getByRole('img', { name: INFO }).querySelector('svg')!);

      // Kendo's tooltip popup, not the icon's own label
      expect(await screen.findByRole('tooltip')).toHaveTextContent(INFO);
    });

    it('shows the info text on keyboard focus too', async () => {
      // Tab reaches the icon, so keyboard users can read the text without a mouse.
      const { user } = renderCaseNumber();

      await user.tab();
      expect(screen.getByRole('img', { name: INFO })).toHaveFocus();

      expect(await screen.findByRole('tooltip')).toHaveTextContent(INFO);
    });

    it.each([
      ['one case', [{ caseNumber: 'CASE-2026-001' }]],
      ['no cases', null],
    ])('shows no info icon with %s', (_label, someCases) => {
      renderCaseNumber({ cases: someCases, selectedCaseNumber: null });

      expect(screen.queryByRole('img', { name: INFO })).not.toBeInTheDocument();
    });
  });

  describe('the combo box', () => {
    // Two is the smallest list that gets the ComboBox: the boundary. With only
    // larger lists, the tests still pass if the threshold went back to "> 10".
    it('shows an empty combo box with the placeholder from two cases', () => {
      renderCaseNumber({ cases: manyCases(2) });

      const box = screen.getByRole('combobox', { name: 'Select case number' });
      expect(box).toHaveAttribute('placeholder', PLACEHOLDER);
      expect(box).toHaveValue('');
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

    it('keeps the current case when the text is cleared', async () => {
      // Clearing the box and leaving it makes Kendo send null; the guard in
      // handleComboBoxChange ignores it rather than report no case
      const { user, onSelectCase } = renderCaseNumber({
        cases: manyCases(12),
        selectedCaseNumber: 'CASE-07',
      });

      await user.clear(screen.getByRole('combobox'));
      await user.tab();

      expect(onSelectCase).not.toHaveBeenCalled();
    });

    it('shows the selected case in the box', () => {
      renderCaseNumber({ cases: manyCases(12), selectedCaseNumber: 'CASE-07' });

      expect(screen.getByRole('combobox')).toHaveValue('CASE-07');
    });

    it('shows an empty box for a selected case not in the list', () => {
      renderCaseNumber({ cases: manyCases(12), selectedCaseNumber: 'CASE-97' });

      expect(screen.getByRole('combobox')).toHaveValue('');
    });

    it('ignores upper and lower case when narrowing', async () => {
      const { user } = renderCaseNumber({ cases: manyCases(12) });

      await user.type(screen.getByRole('combobox'), 'case-1');
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
        'CASE-10',
        'CASE-11',
        'CASE-12',
      ]);
    });

    it('shows the full list again after a case is picked', async () => {
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
    // An error thrown in a click handler doesn't reach the test: React reports it
    // to the window instead. So these collect what reaches the window.
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

    it('picks from the combo box without an error', async () => {
      const { user } = renderCaseNumber({ cases: manyCases(11), onSelectCase: undefined });

      await user.type(screen.getByRole('combobox'), '11');
      await user.click(screen.getByRole('option', { name: 'CASE-11' }));

      expect(errors).toEqual([]);
    });
  });

  describe('with nothing to choose between', () => {
    it('shows a single case as text, not a one-option combo box', () => {
      renderCaseNumber({
        cases: [{ caseNumber: 'CASE-2026-001' }],
        selectedCaseNumber: 'CASE-2026-001',
      });

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.getByText('CASE-2026-001')).toBeInTheDocument();
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['an empty list', []],
    ])('shows no combo box and does not crash when cases is %s', (_label, noCases) => {
      renderCaseNumber({ cases: noCases, selectedCaseNumber: null });

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.getByText('Case Number')).toBeInTheDocument();
    });
  });
});
