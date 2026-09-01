import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CaseSelector from './CaseSelector';
import { threeCases } from '../../test/fixtures';

/**
 * Tests for the CaseSelector wrapper.
 *
 * The wrapper owns very little: a heading, the ⓘ note and its tooltip, and the
 * decision of which dropdown to render. The dropdowns themselves are tested in
 * CustomDropdown.test.tsx and variants.test.tsx, so this file stays away from
 * their internals.
 *
 * Deliberately *not* mocked here, unlike in PdfDetails.test.tsx — the whole
 * job of this component is choosing a variant, so stubbing the variant out
 * would leave nothing worth asserting.
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

/**
 * Find the case-selection control whichever variant is active.
 *
 * CustomDropdown renders a <button>; both Kendo widgets render role="combobox".
 * Written this way, flipping ACTIVE_VARIANT does not break this file — which
 * is the point, since switching variants is the thing this project exists to
 * do.
 */
function findControl() {
  return (
    screen.queryByRole('combobox') ??
    screen.queryByRole('button', { name: 'Select case number' })
  );
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

    it('positions its tooltip when focused', async () => {
      const { user } = renderSelector();

      const note = screen.getByRole('note');
      const tooltip = note.querySelector('.case-selector-tooltip') as HTMLElement;

      // Before focus the tooltip has no computed position.
      expect(tooltip.style.top).toBe('');

      await user.tab();

      // The tooltip uses position: fixed to escape the sidebar's overflow
      // clipping, which means JS has to supply the coordinates. jsdom reports
      // zeroes for getBoundingClientRect, so assert the style was *written*
      // rather than checking a specific pixel value.
      expect(tooltip.style.transform).toBe('translateY(-50%)');
      expect(tooltip.style.top).not.toBe('');
    });

    it('positions its tooltip on hover too', async () => {
      const { user } = renderSelector();

      const note = screen.getByRole('note');
      const tooltip = note.querySelector('.case-selector-tooltip') as HTMLElement;

      await user.hover(note);

      expect(tooltip.style.transform).toBe('translateY(-50%)');
    });
  });
});
