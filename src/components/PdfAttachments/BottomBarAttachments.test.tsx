import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BottomBarAttachments from './BottomBarAttachments';
import { makeAttachment, mixedAttachments } from '../../test/fixtures';

/**
 * Placement 1 — the persistent bottom bar.
 *
 * Purely presentational now: it takes the finished list, so nothing here
 * touches pdf.js or blob URLs. See useAttachments.test.ts for that half, and
 * placements.test.tsx for the contract all three share.
 */

describe('BottomBarAttachments', () => {
  it('renders nothing when the document has no attachments', () => {
    const { container } = render(<BottomBarAttachments attachments={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('starts collapsed, showing only a count', () => {
    render(<BottomBarAttachments attachments={mixedAttachments} />);

    const toggle = screen.getByRole('button', { name: /attachments/i });
    expect(toggle).toHaveTextContent('2');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed by default — filenames should not be on screen yet.
    expect(screen.queryByText('note.mp3')).not.toBeInTheDocument();
  });

  it('reveals the attachments when the row is clicked, and hides them again', async () => {
    const user = userEvent.setup();
    render(<BottomBarAttachments attachments={mixedAttachments} />);

    const toggle = screen.getByRole('button', { name: /attachments/i });

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('note.mp3')).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('note.mp3')).not.toBeInTheDocument();
  });

  it('keeps the decorative icon out of the accessible name', () => {
    render(<BottomBarAttachments attachments={[makeAttachment()]} />);

    // The paperclip is presentation only — it exists to make the bar findable
    // on a phone. If it ever loses aria-hidden, a screen reader announces
    // "paperclip Attachments 1", so pin the name rather than the markup.
    // No space before the count: the visual gap is flex `gap`, not text.
    expect(screen.getByRole('button', { name: /attachments/i })).toHaveAccessibleName(
      'Attachments1',
    );
  });
});
