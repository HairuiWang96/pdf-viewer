import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomDropdown from './CustomDropdown';
import { threeCases } from '../../test/fixtures';

/**
 * Tests for the hand-built dropdown.
 *
 * This is the most valuable component suite in the project. The keyboard and
 * ARIA handling here is ~150 lines we wrote ourselves instead of taking from a
 * library, and it breaks *silently* — nobody notices dead arrow keys by
 * clicking around, so only a test catches it.
 *
 * Note how everything is found by role and accessible name rather than by CSS
 * class. That is not just style: it is the same information a screen reader
 * uses, so these queries double as Section 508 checks.
 */

/** Render with sensible defaults; each test overrides what it cares about. */
function renderDropdown(props: Partial<React.ComponentProps<typeof CustomDropdown>> = {}) {
  const onSelectCase = vi.fn();
  const user = userEvent.setup();

  render(
    <CustomDropdown
      cases={threeCases}
      selectedCaseId={null}
      onSelectCase={onSelectCase}
      {...props}
    />,
  );

  return { user, onSelectCase, trigger: screen.getByRole('button', { name: 'Select case number' }) };
}

/**
 * Open the dropdown from the keyboard and wait until the list actually holds
 * focus.
 *
 * This wait is not padding. CustomDropdown moves focus to the <ul> inside a
 * requestAnimationFrame callback, so for one frame after opening, focus is
 * still on the trigger — and the trigger's key handler ignores ArrowUp and
 * treats Enter as "toggle", not "select". Fire arrow keys before that frame
 * lands and they go to the wrong element and silently do nothing.
 *
 * A real user cannot type inside a single frame, so this is a test-timing
 * concern rather than a bug. `waitFor` retries the assertion until it passes.
 */
async function openWithKeyboard(
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
) {
  trigger.focus();
  await user.keyboard('{Enter}');

  const listbox = await screen.findByRole('listbox');
  await waitFor(() => expect(listbox).toHaveFocus());

  return listbox;
}

describe('CustomDropdown', () => {
  describe('what it shows', () => {
    it('shows a placeholder when no case is selected', () => {
      renderDropdown();

      expect(screen.getByText('Please select a case number')).toBeInTheDocument();
    });

    it('shows the selected case number once one is chosen', () => {
      renderDropdown({ selectedCaseId: '2' });

      expect(screen.getByText('CASE-2026-002')).toBeInTheDocument();
      expect(screen.queryByText('Please select a case number')).not.toBeInTheDocument();
    });

    it('keeps the list closed until asked', () => {
      renderDropdown();

      // queryBy… returns null instead of throwing, which is what you want
      // when asserting that something is absent.
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('lists every case when open', async () => {
      const { user, trigger } = renderDropdown();

      await user.click(trigger);

      expect(screen.getAllByRole('option')).toHaveLength(3);
    });
  });

  describe('mouse', () => {
    it('opens on click and closes on a second click', async () => {
      const { user, trigger } = renderDropdown();

      await user.click(trigger);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      await user.click(trigger);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('reports the chosen case and closes', async () => {
      const { user, onSelectCase, trigger } = renderDropdown();

      await user.click(trigger);
      await user.click(screen.getByRole('option', { name: 'CASE-2026-003' }));

      expect(onSelectCase).toHaveBeenCalledWith('3');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('closes when clicking outside', async () => {
      const { user, trigger } = renderDropdown();

      await user.click(trigger);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      await user.click(document.body);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('keyboard', () => {
    it('opens with Enter', async () => {
      const { user, trigger } = renderDropdown();

      trigger.focus();
      await user.keyboard('{Enter}');

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('opens with Space', async () => {
      const { user, trigger } = renderDropdown();

      trigger.focus();
      await user.keyboard(' ');

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('opens with ArrowDown', async () => {
      const { user, trigger } = renderDropdown();

      trigger.focus();
      await user.keyboard('{ArrowDown}');

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('moves the active option with the arrow keys', async () => {
      const { user, trigger } = renderDropdown();

      const listbox = await openWithKeyboard(user, trigger);

      // aria-activedescendant is how a listbox tells assistive tech which
      // option is current while focus stays on the list itself.
      expect(listbox).toHaveAttribute('aria-activedescendant', 'custom-option-1');

      await user.keyboard('{ArrowDown}');
      expect(listbox).toHaveAttribute('aria-activedescendant', 'custom-option-2');

      await user.keyboard('{ArrowDown}');
      expect(listbox).toHaveAttribute('aria-activedescendant', 'custom-option-3');

      await user.keyboard('{ArrowUp}');
      expect(listbox).toHaveAttribute('aria-activedescendant', 'custom-option-2');
    });

    it('stops at the ends instead of wrapping around', async () => {
      const { user, trigger } = renderDropdown();

      const listbox = await openWithKeyboard(user, trigger);

      // Already on the first option — ArrowUp should stay put.
      await user.keyboard('{ArrowUp}');
      expect(listbox).toHaveAttribute('aria-activedescendant', 'custom-option-1');

      // Walk past the last option — it should stop on the third.
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
      expect(listbox).toHaveAttribute('aria-activedescendant', 'custom-option-3');
    });

    it('starts from the selected case rather than the top', async () => {
      const { user, trigger } = renderDropdown({ selectedCaseId: '3' });

      const listbox = await openWithKeyboard(user, trigger);

      expect(listbox).toHaveAttribute('aria-activedescendant', 'custom-option-3');
    });

    it('selects the active option with Enter', async () => {
      const { user, onSelectCase, trigger } = renderDropdown();

      await openWithKeyboard(user, trigger);
      await user.keyboard('{ArrowDown}'); // move to case 2
      await user.keyboard('{Enter}');     // choose it

      expect(onSelectCase).toHaveBeenCalledWith('2');
    });

    it('closes on Escape without selecting anything', async () => {
      const { user, onSelectCase, trigger } = renderDropdown();

      await openWithKeyboard(user, trigger);
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Escape}');

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(onSelectCase).not.toHaveBeenCalled();
    });

    it('closes on Tab so the list never floats orphaned', async () => {
      const { user, trigger } = renderDropdown();

      await openWithKeyboard(user, trigger);
      await user.tab();

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('returns focus to the trigger after selecting', async () => {
      const { user, trigger } = renderDropdown();

      await openWithKeyboard(user, trigger);
      await user.keyboard('{Enter}');

      // Without this, a keyboard user is stranded on a list that no longer
      // exists and has to Tab from the top of the page again.
      expect(trigger).toHaveFocus();
    });

    it('returns focus to the trigger after Escape', async () => {
      const { user, trigger } = renderDropdown();

      await openWithKeyboard(user, trigger);
      await user.keyboard('{Escape}');

      expect(trigger).toHaveFocus();
    });
  });

  describe('ARIA wiring', () => {
    it('tracks open state with aria-expanded', async () => {
      const { user, trigger } = renderDropdown();

      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      await user.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('announces that it controls a listbox', () => {
      const { trigger } = renderDropdown();

      expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    });

    it('marks only the selected option as selected', async () => {
      const { user, trigger } = renderDropdown({ selectedCaseId: '2' });

      await user.click(trigger);

      expect(screen.getByRole('option', { name: 'CASE-2026-001' })).toHaveAttribute('aria-selected', 'false');
      expect(screen.getByRole('option', { name: 'CASE-2026-002' })).toHaveAttribute('aria-selected', 'true');
    });
  });
});
