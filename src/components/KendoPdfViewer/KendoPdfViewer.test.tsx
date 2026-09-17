import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import KendoPdfViewer from './KendoPdfViewer';

/**
 * Tests for the viewer wrapper itself — what matters here is that it reports
 * the page count up and keeps the page in sync in both directions.
 *
 * KendoReact's PDFViewer needs a canvas and a pdf.js worker to mount, neither
 * of which jsdom provides, so it is replaced with a stand-in that exposes the
 * same ref shape the component reads: `pages` for the page count and
 * `element` for the node scrollToPage is given. That is the entire contract
 * this component depends on, so mocking it tests our code without testing
 * Kendo's.
 */

const { mockState } = vi.hoisted(() => ({
  mockState: {
    pages: [{}, {}] as unknown[],
  },
}));

vi.mock('@progress/kendo-react-all', async () => {
  const React = await import('react');
  return {
    PDFViewer: React.forwardRef(
      (props: { onLoad?: () => void; url?: string }, ref: React.Ref<unknown>) => {
        React.useImperativeHandle(ref, () => ({
          element: null,
          props,
          pages: mockState.pages,
        }));
        // Kendo fires onLoad once the document is parsed; that is when the
        // component reaches for the page count and the document.
        React.useEffect(() => {
          props.onLoad?.();
        }, []);
        return <div data-testid="kendo-pdfviewer" />;
      },
    ),
    scrollToPage: vi.fn(),
  };
});

const defaultProps = {
  filePath: '/case.pdf',
  fileName: 'case.pdf',
  currentPage: 1,
  onPageChange: vi.fn(),
  onLoadSuccess: vi.fn(),
  isMobile: false,
};

describe('KendoPdfViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.pages = [{}, {}];
  });

  it('reports the page count up to the parent when the document loads', async () => {
    const onLoadSuccess = vi.fn();
    render(<KendoPdfViewer {...defaultProps} onLoadSuccess={onLoadSuccess} />);

    await screen.findByTestId('kendo-pdfviewer');
    expect(onLoadSuccess).toHaveBeenCalledWith(2);
  });

  it('stays quiet about the page count when the document reports no pages', async () => {
    const onLoadSuccess = vi.fn();
    mockState.pages = [];
    render(<KendoPdfViewer {...defaultProps} onLoadSuccess={onLoadSuccess} />);

    await screen.findByTestId('kendo-pdfviewer');
    expect(onLoadSuccess).not.toHaveBeenCalled();
  });

});
