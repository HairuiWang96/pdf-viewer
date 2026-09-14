import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BottomBarAttachments from './BottomBarAttachments';
import ToolbarAttachments from './ToolbarAttachments';
import DetailsAttachments from './DetailsAttachments';
import { PLACEMENT_OPTIONS } from './placement';
import { makeAttachment, mixedAttachments } from '../../test/fixtures';

/**
 * The three-way placement comparison, as tests.
 *
 * This is a research ticket, so the point of this file is to make the
 * differences between the placements *executable* — evidence rather than a
 * comment somebody has to take on trust. Same shape as the CaseSelector
 * variants suite next door, and for the same reason.
 *
 * Two halves:
 *
 *   1. A shared contract every placement must satisfy, run against all three.
 *   2. Per-placement tests recording where they deliberately diverge.
 *
 * ── A finding from writing this ──
 *
 * The shared half needs a per-placement *reveal* step, because two of the
 * three hide their list behind an interaction and the third does not:
 *
 *   BottomBar  collapsed until the bar is clicked
 *   Toolbar    closed until the toolbar button is clicked
 *   Details    always expanded — it is already inside a panel you opened
 *
 * That difference is the placements' whole personality, and it is why the
 * contract can only assert what is true *after* reveal. What each costs to
 * reach is the thing the ticket is actually deciding between.
 */

interface Placement {
  id: string;
  Component: typeof BottomBarAttachments;
  /** Get the list on screen, from a freshly rendered component. */
  reveal: () => Promise<void>;
}

const user = userEvent.setup();

const placements: Placement[] = [
  {
    id: 'bottom',
    Component: BottomBarAttachments,
    reveal: () => user.click(screen.getByRole('button', { name: /attachments/i })),
  },
  {
    id: 'toolbar',
    Component: ToolbarAttachments,
    reveal: () => user.click(screen.getByRole('button', { name: /attachments/i })),
  },
  {
    id: 'details',
    Component: DetailsAttachments,
    // Already open; nothing to do.
    reveal: () => Promise.resolve(),
  },
];

describe.each(placements)('$id — the shared contract', ({ Component, reveal }) => {
  it('renders nothing at all when there are no attachments', () => {
    const { container } = render(<Component attachments={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count without being opened', () => {
    render(<Component attachments={mixedAttachments} />);

    // Whatever else differs, every placement is an *indicator* first: the
    // number has to be readable before any interaction.
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('gives each audio attachment its own player and source', async () => {
    render(
      <Component
        attachments={[
          makeAttachment({ filename: 'part1.mp3', url: 'blob:a' }),
          makeAttachment({ filename: 'part2.mp3', url: 'blob:b' }),
        ]}
      />,
    );
    await reveal();

    const players = document.querySelectorAll('audio');
    expect(players).toHaveLength(2);
    expect(new Set([...players].map((p) => p.getAttribute('src'))).size).toBe(2);
  });

  it('offers a download link instead of a player for non-audio files', async () => {
    render(<Component attachments={mixedAttachments} />);
    await reveal();

    const link = screen.getByRole('link', { name: /download/i });
    expect(link).toHaveAttribute('download', 'transcript.pdf');
    // The mixed fixture has exactly one of each.
    expect(document.querySelectorAll('audio')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Where they differ
// ---------------------------------------------------------------------------

describe('BottomBar — the one that cannot be missed', () => {
  it('costs a permanent row even while collapsed', () => {
    const { container } = render(<BottomBarAttachments attachments={mixedAttachments} />);

    // The trade this placement makes: the bar is in the layout whether or not
    // anyone wants it, which is exactly why it is never missed.
    expect(container.querySelector('.pdf-attachments')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /attachments/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

describe('Toolbar — the one that costs no space', () => {
  it('closes on Escape, since a popover you cannot dismiss is a trap', async () => {
    render(<ToolbarAttachments attachments={mixedAttachments} />);

    await user.click(screen.getByRole('button', { name: /attachments/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when you click away from it', async () => {
    render(
      <div>
        <ToolbarAttachments attachments={mixedAttachments} />
        <button type="button">elsewhere</button>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: /attachments/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('positions the popover with fixed coordinates, not inside the toolbar', async () => {
    render(<ToolbarAttachments attachments={mixedAttachments} />);

    await user.click(screen.getByRole('button', { name: /attachments/i }));

    // Kendo's .k-toolbar is overflow:hidden. An absolutely positioned popover
    // is clipped out of existence there — the button lights up and nothing
    // appears, which is exactly the bug this guards. Fixed positioning escapes
    // the clip, but only if the coordinates are actually applied.
    const popover = screen.getByRole('dialog');
    expect(popover.style.position || getComputedStyle(popover).position).not.toBe('absolute');
    expect(popover.style.top).not.toBe('');
    expect(popover.style.right).not.toBe('');
  });

  it('keeps its name in text, because the trigger is icon-only on mobile', () => {
    render(<ToolbarAttachments attachments={[makeAttachment()]} />);

    // The label is visually hidden at narrow widths, not removed — an
    // icon-only button with no accessible name is announced as "button".
    expect(screen.getByRole('button', { name: /attachments/i })).toBeInTheDocument();
  });
});

describe('Details — the one that reads as metadata', () => {
  it('is open on arrival, with no toggle to find', () => {
    render(<DetailsAttachments attachments={mixedAttachments} />);

    // No disclosure control at all: the panel it lives in was already opened
    // deliberately, so a second thing to open would be a second lock on the
    // same door.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('note.mp3')).toBeInTheDocument();
  });

  it('uses the details panel’s own section markup, so it blends in', () => {
    const { container } = render(<DetailsAttachments attachments={mixedAttachments} />);

    // Blending in is the placement's whole premise — it should look like
    // Tags and File Info, not like a control bolted into the panel.
    expect(container.querySelector('.details-section')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /attachments/i })).toBeInTheDocument();
  });
});

describe('PLACEMENT_OPTIONS', () => {
  it('describes every placement the switcher can select', () => {
    // The switcher renders from this list, so a placement missing from it is
    // a placement nobody can reach.
    expect(PLACEMENT_OPTIONS.map((option) => option.id)).toEqual([
      'bottom',
      'toolbar',
      'details',
    ]);
    for (const option of PLACEMENT_OPTIONS) {
      expect(option.label).toBeTruthy();
      expect(option.summary).toBeTruthy();
    }
  });
});
