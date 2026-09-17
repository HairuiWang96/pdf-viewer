import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CaseSelector from './CaseSelector';
import { threeCases } from '../../test/fixtures';

/**
 * Tests for the CaseSelector wrapper.
 *
 * The wrapper owns very little: a heading, the ⓘ note and its tooltip, and the
 * dropdown it renders. The dropdown itself is tested in
 * KendoDropDownList.test.tsx, so this file stays away from its internals.
 *
 * Deliberately *not* mocked here, unlike in PdfDetails.test.tsx — rendering
 * the dropdown is most of what this component does, so stubbing it out would
 * leave little worth asserting.
 */

function renderSelector(selectedCaseId: string | null = null) {
  const onSelectCase = vi.fn();

  render(
    <CaseSelector
      cases={threeCases}
      selectedCaseId={selectedCaseId}
      onSelectCase={onSelectCase}
    />,
  );

  return { onSelectCase, user: userEvent.setup() };
}

/** The dropdown itself — Kendo renders it as role="combobox". */
function findControl() {
  return screen.queryByRole('combobox');
}

describe('CaseSelector', () => {
  it('labels the section', () => {
    renderSelector();

    expect(screen.getByRole('heading', { name: 'Case Number' })).toBeInTheDocument();
  });

  it('renders whichever dropdown variant is active', () => {
    renderSelector();

    expect(findControl()).toBeInTheDocument();
  });

  it('passes the selected case through to the dropdown', () => {
    renderSelector('2');

    // Proves the wrapper is forwarding props rather than swallowing them.
    expect(screen.getByText('CASE-2026-002')).toBeInTheDocument();
  });

  describe('the ⓘ note', () => {
    it('explains what changing the case will do', () => {
      renderSelector();

      // role="note" with an aria-label is how the icon carries its meaning
      // to screen readers — the ⓘ glyph alone announces nothing useful.
      expect(
        screen.getByRole('note', {
          name: 'Selecting a new case number will refresh all document details',
        }),
      ).toBeInTheDocument();
    });

    it('is reachable by keyboard', async () => {
      const { user } = renderSelector();

      const note = screen.getByRole('note');
      await user.tab();

      // tabIndex={0} puts it in the tab order. Without it the tooltip would
      // be hover-only, which is a Section 508 failure.
      expect(note).toHaveFocus();
    });

    /**
     * These two check that the positioning code *ran*, not where the tooltip
     * ended up. jsdom has no layout — getBoundingClientRect returns zeroes —
     * so the pixel values here are meaningless and deliberately not asserted.
     *
     * They are two tests because they are two separate wires:
     * onFocus for keyboard, onMouseEnter for mouse. Removing either is a real
     * bug for half the users, and neither would fail the other's test.
     *
     * What goes wrong when nothing fires: the tooltip is position:fixed with
     * no top/right, so it lands in the top-left corner of the screen instead
     * of beside the icon.
     */
    it('gives the tooltip coordinates when focused', async () => {
      const { user } = renderSelector();

      const note = screen.getByRole('note');
      const tooltip = note.querySelector('.case-selector-tooltip') as HTMLElement;

      // Nothing written yet — this is what stops the assertion below being
      // vacuous, by showing the style appears *because of* the interaction.
      expect(tooltip.style.top).toBe('');

      await user.tab();

      expect(tooltip.style.top).not.toBe('');
      expect(tooltip.style.transform).toBe('translateY(-50%)');
    });

    it('gives the tooltip coordinates on hover too', async () => {
      const { user } = renderSelector();

      const note = screen.getByRole('note');
      const tooltip = note.querySelector('.case-selector-tooltip') as HTMLElement;

      expect(tooltip.style.top).toBe('');

      await user.hover(note);

      expect(tooltip.style.top).not.toBe('');
      expect(tooltip.style.transform).toBe('translateY(-50%)');
    });
  });
});
