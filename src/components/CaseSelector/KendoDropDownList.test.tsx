import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KendoDropDownList from './KendoDropDownList';
import { threeCases } from '../../test/fixtures';

/**
 * Tests for the KendoReact DropDownList on its own.
 *
 * variants.test.tsx runs this component alongside the other two to compare
 * them. This suite stands alone so it can move to a project that only uses
 * the Kendo version.
 *
 * Kendo's keyboard handling and ARIA are Telerik's to test, not ours. What is
 * ours is the ~10 lines of glue in KendoDropDownList.tsx: turning an id into
 * the selected item, turning Kendo's change event back into an id, and the
 * ariaLabel.
 */

const PLACEHOLDER = 'Please select a case number';

/** Render with sensible defaults; each test overrides what it cares about. */
function renderDropDownList(props: Partial<React.ComponentProps<typeof KendoDropDownList>> = {}) {
  const onSelectCase = vi.fn();
  const user = userEvent.setup();

  render(<KendoDropDownList cases={threeCases} selectedCaseId={null} onSelectCase={onSelectCase} {...props} />);

  return { user, onSelectCase, combobox: screen.getByRole('combobox') };
}

describe('KendoDropDownList', () => {
  describe('what it shows', () => {
    it('shows a placeholder when no case is selected', () => {
      renderDropDownList();

      expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
    });

    it('shows the selected case number once one is chosen', () => {
      renderDropDownList({ selectedCaseId: '2' });

      expect(screen.getByText('CASE-2026-002')).toBeInTheDocument();
      expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument();
    });

    it('falls back to the placeholder for an id that is not in the list', () => {
      // A stale id, e.g. a case deleted since it was chosen, must not leave
      // the control showing nothing at all.
      renderDropDownList({ selectedCaseId: 'no-such-case' });

      expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
    });
  });

  describe('selecting', () => {
    it('reports the chosen case to its parent', async () => {
      const { user, onSelectCase, combobox } = renderDropDownList();

      await user.click(combobox);
      await user.click(screen.getByRole('option', { name: 'CASE-2026-002' }));

      // Kendo hands back the whole data item; the component has to dig the id
      // out of it. This is the line that would break if the shape changed.
      expect(onSelectCase).toHaveBeenCalledWith('2');
    });

    // The other side of `if (selected.id)`. The placeholder row is a real,
    // clickable item with a null id; without the guard, picking it would hand
    // the parent null as a case id. Starts on a real case because Kendo fires
    // no change when the current value is picked again.
    it('ignores the placeholder when it is picked', async () => {
      const { user, onSelectCase, combobox } = renderDropDownList({ selectedCaseId: '2' });
      await user.click(combobox);
      await user.click(screen.getByText(PLACEHOLDER));
      expect(onSelectCase).not.toHaveBeenCalled();
    });
  });

  describe('the placeholder limitation', () => {
    it('lists the placeholder as a selectable item', async () => {
      const { user, combobox } = renderDropDownList();

      await user.click(combobox);

      // `defaultItem` is not a true placeholder. Kendo renders it into the
      // popup as a clickable entry, marked as the current selection.
      const optionLabel = document.querySelector('.k-list-optionlabel');
      expect(optionLabel).toHaveTextContent(PLACEHOLDER);
      expect(optionLabel).toHaveClass('k-selected');
    });

    it('does not expose that entry as an option to screen readers', async () => {
      const { user, combobox } = renderDropDownList();

      await user.click(combobox);

      // Three options by role, but four clickable rows on screen.
      expect(screen.getAllByRole('option')).toHaveLength(3);
    });
  });

  describe('accessibility', () => {
    it('is named for a screen reader', () => {
      renderDropDownList();

      // Kendo does not name the control on its own. Without ariaLabel a screen
      // reader announces only "combobox".
      expect(screen.getByRole('combobox', { name: 'Select case number' })).toBeInTheDocument();
    });
  });
});
