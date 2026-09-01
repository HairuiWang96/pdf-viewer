import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Layout from './Layout';

/**
 * Tests for the app shell: header, skip link, and the mobile details toggle.
 *
 * Almost everything here is an accessibility feature, so the tests read as a
 * Section 508 checklist. That is the useful thing about querying by role — the
 * assertions and the accessibility requirements turn out to be the same
 * sentences.
 */

function renderLayout(props: Partial<React.ComponentProps<typeof Layout>> = {}) {
  const onToggleDetails = vi.fn();

  render(
    <Layout
      title="Q1 2026 Market Report"
      isMobile={false}
      isDetailsOpen={false}
      onToggleDetails={onToggleDetails}
      {...props}
    >
      <p>viewer goes here</p>
    </Layout>,
  );

  return { onToggleDetails, user: userEvent.setup() };
}

describe('Layout', () => {
  it('shows the document title as the page heading', () => {
    renderLayout();

    // level: 1 means <h1>. There should be exactly one per page.
    expect(screen.getByRole('heading', { level: 1, name: 'Q1 2026 Market Report' }))
      .toBeInTheDocument();
  });

  it('renders whatever it is given as children', () => {
    renderLayout();

    expect(screen.getByText('viewer goes here')).toBeInTheDocument();
  });

  it('puts the children inside the main landmark', () => {
    renderLayout();

    // A <main> landmark lets screen reader users jump straight to content.
    expect(screen.getByRole('main')).toContainElement(screen.getByText('viewer goes here'));
  });

  describe('skip link', () => {
    it('offers a skip-to-content link', () => {
      renderLayout();

      expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeInTheDocument();
    });

    it('points at the main landmark', () => {
      renderLayout();

      const link = screen.getByRole('link', { name: 'Skip to main content' });
      const main = screen.getByRole('main');

      // The link is useless if its target id does not exist — an easy thing
      // to break by renaming the id on <main>.
      expect(link).toHaveAttribute('href', '#main-content');
      expect(main).toHaveAttribute('id', 'main-content');
    });

    it('is reachable as the very first tab stop', async () => {
      const { user } = renderLayout();

      await user.tab();

      // It is visually hidden until focused, so if it is not first in the tab
      // order it may as well not exist.
      expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus();
    });
  });

  describe('details toggle', () => {
    it('is hidden on desktop, where the panel is always visible', () => {
      renderLayout({ isMobile: false });

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('appears on mobile', () => {
      renderLayout({ isMobile: true });

      expect(screen.getByRole('button', { name: 'Show details' })).toBeInTheDocument();
    });

    it('describes what it will do, not what is showing', () => {
      renderLayout({ isMobile: true, isDetailsOpen: true });

      // Open panel → the button now offers to hide it.
      expect(screen.getByRole('button', { name: 'Hide details' })).toBeInTheDocument();
    });

    it('reports panel state with aria-expanded', () => {
      renderLayout({ isMobile: true, isDetailsOpen: true });

      expect(screen.getByRole('button', { name: 'Hide details' }))
        .toHaveAttribute('aria-expanded', 'true');
    });

    it('calls back when pressed', async () => {
      const { user, onToggleDetails } = renderLayout({ isMobile: true });

      await user.click(screen.getByRole('button', { name: 'Show details' }));

      expect(onToggleDetails).toHaveBeenCalledTimes(1);
    });
  });
});
