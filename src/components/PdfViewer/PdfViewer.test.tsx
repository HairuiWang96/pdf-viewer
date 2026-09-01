import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PdfViewer from './PdfViewer';

/**
 * Tests for the viewer on the `iframe-viewer` branch.
 *
 * This is the branch-specific component — the one thing that genuinely differs
 * between the three approaches — and it is also the smallest thing we can
 * test, which is itself the finding.
 *
 * The component hands a file path to an <iframe> and stops. Everything after
 * that belongs to the browser: the toolbar, the page rendering, the zoom
 * controls, the scrolling. None of it is reachable from here, because an
 * <iframe> is a separate document. So there are exactly two things worth
 * asserting, and no amount of extra effort would produce a third.
 *
 * Compare with the other branches, where the viewer renders into our own DOM
 * and there is real behaviour to test.
 */
describe('PdfViewer (iframe)', () => {
  it('points the iframe at the file it was given', () => {
    render(<PdfViewer filePath="/q1-market-report.pdf" />);

    // getByTitle finds the iframe by its title attribute, which is also the
    // accessible name screen readers announce for embedded content.
    expect(screen.getByTitle('PDF Document')).toHaveAttribute(
      'src',
      '/q1-market-report.pdf',
    );
  });

  it('follows the path when a different case is selected', () => {
    const { rerender } = render(<PdfViewer filePath="/q1-market-report.pdf" />);

    // rerender() re-renders the same component with new props, which is what
    // happens when the user picks a different case upstream.
    rerender(<PdfViewer filePath="/q2-market-report-stamped.pdf" />);

    expect(screen.getByTitle('PDF Document')).toHaveAttribute(
      'src',
      '/q2-market-report-stamped.pdf',
    );
  });

  it('gives the frame an accessible title', () => {
    render(<PdfViewer filePath="/q1-market-report.pdf" />);

    // An <iframe> with no title is announced as "frame" and nothing else,
    // which is a Section 508 failure. This is the only accessibility
    // requirement this component carries.
    expect(screen.getByTitle('PDF Document')).toBeInTheDocument();
  });
});
