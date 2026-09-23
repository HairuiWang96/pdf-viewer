import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThumbnailSidebar from './ThumbnailSidebar';

/**
 * Tests for the page thumbnail rail.
 *
 * usePdfThumbnails is mocked — it is covered by its own suite, and rendering
 * real PDF pages needs a canvas jsdom does not have. Here the interest is the
 * rail's own behaviour: what it does before thumbnails arrive, how the current
 * page is marked, and the extra mobile handling.
 */

const { thumbnailsMock } = vi.hoisted(() => ({
  thumbnailsMock: { pages: [] as string[] },
}));

vi.mock('../../hooks', () => ({
  usePdfThumbnails: () => thumbnailsMock.pages,
}));

const defaultProps = {
  // The hook is mocked, so the document itself is never read here.
  pdfDocument: null,
  currentPage: 1,
  onPageChange: vi.fn(),
  isMobile: false,
  isOpen: false,
  onClose: vi.fn(),
};

describe('ThumbnailSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    thumbnailsMock.pages = ['data:image/png;base64,A', 'data:image/png;base64,B'];
  });

  it('renders nothing until thumbnails exist, so no empty rail flashes', () => {
    thumbnailsMock.pages = [];

    const { container } = render(<ThumbnailSidebar {...defaultProps} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows one button per page', () => {
    render(<ThumbnailSidebar {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeInTheDocument();
  });

  it('marks the current page for assistive tech, not just visually', () => {
    render(<ThumbnailSidebar {...defaultProps} currentPage={2} />);

    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 1' })).not.toHaveAttribute('aria-current');
  });

  it('reports the chosen page to the parent', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();

    render(<ThumbnailSidebar {...defaultProps} onPageChange={onPageChange} />);
    await user.click(screen.getByRole('button', { name: 'Page 2' }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('leaves the rail open on desktop after a page is picked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<ThumbnailSidebar {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Page 2' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes itself on mobile so the reader sees the page they picked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<ThumbnailSidebar {...defaultProps} isMobile isOpen onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Page 2' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('becomes a modal dialog on mobile, with a way out', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<ThumbnailSidebar {...defaultProps} isMobile isOpen onClose={onClose} />);

    const panel = screen.getByRole('dialog');
    expect(panel).toHaveAttribute('aria-modal', 'true');

    await user.click(screen.getByRole('button', { name: /close thumbnails/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('is a plain navigation region on desktop, with no close button', () => {
    render(<ThumbnailSidebar {...defaultProps} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /page thumbnails/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close thumbnails/i })).not.toBeInTheDocument();
  });

  it('is not marked modal while closed on mobile', () => {
    render(<ThumbnailSidebar {...defaultProps} isMobile isOpen={false} />);

    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-modal');
  });
});
