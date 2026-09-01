import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomDropdown from './CustomDropdown';
import KendoDropDownList from './KendoDropDownList';
import KendoComboBox from './KendoComboBox';
import { threeCases } from '../../test/fixtures';

/**
 * The three-way dropdown comparison, as tests.
 *
 * CaseSelector can render any of three implementations, picked by the
 * ACTIVE_VARIANT constant. The point of this file is to make the differences
 * between them *executable*, so the comparison is evidence rather than a
 * comment somebody has to take on trust.
 *
 * Two halves:
 *
 *   1. A shared contract every variant must satisfy, run against all three
 *      with describe.each.
 *   2. Variant-specific tests recording where they diverge.
 *
 * ── A finding from writing this ──
 *
 * The shared half needs a per-variant *adapter* to read what the control is
 * displaying, because the three render completely different DOM:
 *
 *   CustomDropdown    a <button> whose text is the current value
 *   KendoDropDownList a <span role="combobox"> with the value as text
 *   KendoComboBox     an <input> with a real placeholder attribute
 *
 * That the adapter is necessary at all is itself part of the comparison:
 * these are not drop-in replacements for one another.
 */

interface Variant {
  name: string;
  Component: typeof CustomDropdown;
  /** Assert the placeholder is visible while nothing is selected. */
  expectPlaceholder: () => void;
  /** Assert the given case number is what the control currently shows. */
  expectDisplays: (caseNumber: string) => void;
}

const PLACEHOLDER = 'Please select a case number';

const variants: Variant[] = [
  {
    name: 'CustomDropdown',
    Component: CustomDropdown,
    expectPlaceholder: () => expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument(),
    expectDisplays: (caseNumber) => expect(screen.getByText(caseNumber)).toBeInTheDocument(),
  },
  {
    name: 'KendoDropDownList',
    Component: KendoDropDownList as typeof CustomDropdown,
    // Kendo renders the value as text inside the picker.
    expectPlaceholder: () => expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument(),
    expectDisplays: (caseNumber) => expect(screen.getByText(caseNumber)).toBeInTheDocument(),
  },
  {
    name: 'KendoComboBox',
    Component: KendoComboBox as typeof CustomDropdown,
    // A real <input placeholder>, so it is queried differently — and the
    // input's value stays empty, which is what a true placeholder means.
    expectPlaceholder: () => {
      const input = screen.getByPlaceholderText(PLACEHOLDER);
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('');
    },
    expectDisplays: (caseNumber) =>
      expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue(caseNumber),
  },
];

// ---------------------------------------------------------------------------
// 1. The shared contract — every variant must do these things
// ---------------------------------------------------------------------------

describe.each(variants)('$name (shared contract)', ({ Component, expectPlaceholder, expectDisplays }) => {
  it('shows a placeholder when no case is selected', () => {
    render(<Component cases={threeCases} selectedCaseId={null} onSelectCase={vi.fn()} />);

    expectPlaceholder();
  });

  it('shows the selected case number once one is chosen', () => {
    render(<Component cases={threeCases} selectedCaseId="2" onSelectCase={vi.fn()} />);

    expectDisplays('CASE-2026-002');
  });

  it('does not show the placeholder once a case is selected', () => {
    render(<Component cases={threeCases} selectedCaseId="2" onSelectCase={vi.fn()} />);

    // The ComboBox keeps its placeholder *attribute* but the value wins, so
    // check for the visible placeholder text rather than the attribute.
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Where they differ
// ---------------------------------------------------------------------------

describe('CustomDropdown — what building it ourselves bought', () => {
  it('gives the control an accessible name', () => {
    render(<CustomDropdown cases={threeCases} selectedCaseId={null} onSelectCase={vi.fn()} />);

    // A screen reader announces "Select case number, button". Both Kendo
    // widgets fail this — see below.
    expect(screen.getByRole('button', { name: 'Select case number' })).toBeInTheDocument();
  });

  it('keeps the placeholder out of the option list', async () => {
    const user = userEvent.setup();
    render(<CustomDropdown cases={threeCases} selectedCaseId={null} onSelectCase={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Select case number' }));

    // Exactly three options — the three real cases. The placeholder is
    // display text on the trigger, not something you can pick.
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.textContent)).toEqual([
      'CASE-2026-001',
      'CASE-2026-002',
      'CASE-2026-003',
    ]);
  });
});

describe('KendoDropDownList — the free tier and its limitation', () => {
  it('THE LIMITATION: the placeholder is a selectable item in the list', async () => {
    const user = userEvent.setup();
    render(<KendoDropDownList cases={threeCases} selectedCaseId={null} onSelectCase={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));

    // `defaultItem` is not a true placeholder — Kendo renders it into the
    // popup as a clickable entry, marked as the current selection. A user can
    // deliberately pick "Please select a case number" as their answer.
    const optionLabel = document.querySelector('.k-list-optionlabel');
    expect(optionLabel).toHaveTextContent(PLACEHOLDER);
    expect(optionLabel).toHaveClass('k-selected');
  });

  it('and that entry is not even exposed as an option to screen readers', async () => {
    const user = userEvent.setup();
    render(<KendoDropDownList cases={threeCases} selectedCaseId={null} onSelectCase={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));

    // Three options by role, but four clickable rows on screen. The
    // placeholder row is a bare <div> with no role="option", so assistive
    // tech cannot reach an entry a mouse user can click.
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('reports the chosen case to its parent', async () => {
    const user = userEvent.setup();
    const onSelectCase = vi.fn();
    render(<KendoDropDownList cases={threeCases} selectedCaseId={null} onSelectCase={onSelectCase} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'CASE-2026-002' }));

    // Kendo hands back the whole data item; the component has to dig the id
    // out of it. This is the line that would break if the shape changed.
    expect(onSelectCase).toHaveBeenCalledWith('2');
  });

  it.fails('has no accessible name (documented gap, not a passing behaviour)', () => {
    render(<KendoDropDownList cases={threeCases} selectedCaseId={null} onSelectCase={vi.fn()} />);

    // it.fails() means "we expect this assertion to fail today". The suite
    // stays green while recording the gap — and if a future Kendo release
    // adds a label, this test starts failing and tells us to update the notes.
    expect(screen.getByRole('combobox', { name: /case/i })).toBeInTheDocument();
  });
});

describe('KendoComboBox — the premium one', () => {
  it('uses a real placeholder, so the field is genuinely empty', () => {
    render(<KendoComboBox cases={threeCases} selectedCaseId={null} onSelectCase={vi.fn()} />);

    const input = screen.getByPlaceholderText(PLACEHOLDER);

    // The difference from DropDownList: nothing is selected and there is no
    // pickable "placeholder" entry. This is the behaviour we wanted.
    expect(input).toHaveValue('');
  });

  it('THE TRADE-OFF: the field accepts free text', async () => {
    const user = userEvent.setup();
    render(<KendoComboBox cases={threeCases} selectedCaseId={null} onSelectCase={vi.fn()} />);

    const input = screen.getByPlaceholderText(PLACEHOLDER);
    await user.type(input, 'not a case number');

    // A ComboBox is an editable input. For a fixed list of case numbers that
    // is a downgrade from a plain listbox — the user can type nonsense.
    expect(input).toHaveValue('not a case number');
  });

  it('reports the chosen case to its parent', async () => {
    const user = userEvent.setup();
    const onSelectCase = vi.fn();
    render(<KendoComboBox cases={threeCases} selectedCaseId={null} onSelectCase={onSelectCase} />);

    // The ComboBox does not open from the input — that is where you type.
    // It opens from its own toggle button, which Kendo labels for us.
    await user.click(screen.getByRole('button', { name: 'expand combobox' }));
    await user.click(screen.getByRole('option', { name: 'CASE-2026-003' }));

    expect(onSelectCase).toHaveBeenCalledWith('3');
  });

  it.fails('has no accessible name (documented gap)', () => {
    render(<KendoComboBox cases={threeCases} selectedCaseId={null} onSelectCase={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: /case/i })).toBeInTheDocument();
  });
});
