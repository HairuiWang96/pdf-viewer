import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolbarPager } from './ToolbarPager';

/**
 * Tests for our pager in the viewer toolbar. It is Kendo's real Pager here,
 * not a fake: what is under test is that we give it the right props, so it
 * shows our page and reports the page asked for. Which page that is, and the
 * scrolling, are PDFDocViewer's (its "page number" tests).
 */

// The typed-number box shows the page; the buttons are found by their names,
// as a screen reader would announce them (Kendo's titles)
const pageBox = () => screen.getByRole('spinbutton', { name: 'Type a page number' });
const nextButton = () => screen.getByRole('button', { name: 'Go to the next page' });
const previousButton = () => screen.getByRole('button', { name: 'Go to the previous page' });

describe('ToolbarPager', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the page it is given, counted from 1', () => {
    render(<ToolbarPager page={1} total={5} onPageChange={() => {}} />);

    expect(pageBox()).toHaveValue('2');
    expect(screen.getByText('of 5')).toBeInTheDocument();
  });

  it('asks for the next and previous pages, counted from 0', async () => {
    const onPageChange = vi.fn();
    render(<ToolbarPager page={1} total={5} onPageChange={onPageChange} />);

    await userEvent.click(nextButton());
    expect(onPageChange).toHaveBeenLastCalledWith(2);

    await userEvent.click(previousButton());
    expect(onPageChange).toHaveBeenLastCalledWith(0);
  });

  it('asks for a typed page number', async () => {
    const onPageChange = vi.fn();
    render(<ToolbarPager page={0} total={5} onPageChange={onPageChange} />);

    await userEvent.clear(pageBox());
    await userEvent.type(pageBox(), '4{Enter}');

    expect(onPageChange).toHaveBeenLastCalledWith(3);
  });

  it('can’t be used before the pages have appeared', () => {
    // The whole pager greyed out, typed-number box too, as Kendo's own was.
    // With 0 pages Kendo greys out the arrows by itself; `disabled` is what
    // greys out the box (its theme's k-disabled class, on the whole pager).
    render(<ToolbarPager page={0} total={0} onPageChange={() => {}} />);

    expect(screen.getByRole('application')).toHaveClass('k-disabled');
  });
});
