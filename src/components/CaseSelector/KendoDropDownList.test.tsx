import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KendoDropDownList from './KendoDropDownList';
import { threeCases } from '../../test/fixtures';

/**
 * KendoReact's DropDownList (the free tier), which is the only case picker on
 * this branch. kendo-react-all compares it against a hand-built dropdown and
 * the premium ComboBox; here there is nothing to compare it to.
 *
 * Kendo is deliberately *not* mocked. Unlike the PDF viewer, which needs a
 * canvas and a pdf.js worker, this renders as ordinary DOM and works fine in
 * jsdom — and mocking something that runs only tests the mock.
 *
 * So what is left to test is the roughly four lines that are ours: the id to
 * object lookup, digging the id back out of Kendo's change event, the guard
 * against the placeholder row, and the props we hand over. Opening the popup,
 * keyboard navigation and rendering are Telerik's, and already have Telerik's
 * tests.
 */

const PLACEHOLDER = 'Please select a case number';

describe('KendoDropDownList', () => {
  it('shows a placeholder when no case is selected', () => {
    render(<KendoDropDownList cases={threeCases} selectedCaseId={null} onSelectCase={vi.fn()} />);

    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
  });

  it('shows the selected case number once one is chosen', () => {
    render(<KendoDropDownList cases={threeCases} selectedCaseId="2" onSelectCase={vi.fn()} />);

    // Our find() turned the id back into the case object Kendo displays.
    expect(screen.getByText('CASE-2026-002')).toBeInTheDocument();
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument();
  });

  it('reports the chosen case to its parent', async () => {
    const user = userEvent.setup();
    const onSelectCase = vi.fn();
    render(
      <KendoDropDownList cases={threeCases} selectedCaseId={null} onSelectCase={onSelectCase} />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'CASE-2026-002' }));

    // Kendo hands back the whole data item; the component has to dig the id
    // out of it. This is the line that would break if the shape changed.
    expect(onSelectCase).toHaveBeenCalledWith('2');
  });

  it('is named for a screen reader', () => {
    render(<KendoDropDownList cases={threeCases} selectedCaseId={null} onSelectCase={vi.fn()} />);

    // Kendo does not name the control on its own — without an explicit
    // ariaLabel it announces as a bare "combobox".
    expect(screen.getByRole('combobox', { name: /case/i })).toBeInTheDocument();
  });

  /**
   * `defaultItem` is not a true placeholder. Kendo renders it into the popup
   * as a clickable row, so a user can pick "Please select a case number" as
   * their answer — which is the whole reason handleChange guards on the id.
   */
  describe('the placeholder row', () => {
    /**
     * This one tests Kendo, not us, and is here on purpose: it pins the
     * assumption the guard below is built on. If a future Kendo release makes
     * defaultItem a real placeholder, this fails — and that failure is the
     * signal that the guard, and its test, may no longer be needed.
     *
     * That is the only reason to test a vendor: to be told when the thing you
     * worked around has changed.
     */
    it('is a clickable row, not a real placeholder', async () => {
      const user = userEvent.setup();
      render(<KendoDropDownList cases={threeCases} selectedCaseId={null} onSelectCase={vi.fn()} />);

      await user.click(screen.getByRole('combobox'));

      const optionLabel = document.querySelector('.k-list-optionlabel');
      expect(optionLabel).toHaveTextContent(PLACEHOLDER);
      expect(optionLabel).toHaveClass('k-selected');
    });

    it('is ignored when clicked, rather than selecting a case that does not exist', async () => {
      const user = userEvent.setup();
      const onSelectCase = vi.fn();
      render(
        <KendoDropDownList cases={threeCases} selectedCaseId="2" onSelectCase={onSelectCase} />,
      );

      await user.click(screen.getByRole('combobox'));
      // Clicked by class rather than by role, because Kendo gives this row no
      // role="option" — a mouse is the only way to reach it, which is exactly
      // what makes the guard necessary.
      await user.click(document.querySelector('.k-list-optionlabel')!);

      // defaultItem carries id: null, which is what `if (selected.id)` is for.
      // Without that guard this fires onSelectCase(null), the app selects a
      // case that does not exist, and the details panel silently empties.
      expect(onSelectCase).not.toHaveBeenCalled();
    });
  });
});
