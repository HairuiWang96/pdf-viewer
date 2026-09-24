import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import KendoPdfViewer from './KendoPdfViewer';

/**
 * Tests for the viewer wrapper itself. The attachments panel it renders has
 * its own suite next to the component — what matters here is that the viewer
 * reports the page count and hands the parsed document over.
 *
 * KendoReact's PDFViewer needs a canvas and a pdf.js worker to mount, neither
 * of which jsdom provides, so it is replaced with a stand-in that exposes the
 * same ref shape the component reads: `pages` for the page count and
 * `document` for the pdf.js document. That is the entire contract this
 * component depends on, so mocking it tests our code without testing Kendo's.
 */

const { mockState } = vi.hoisted(() => ({
  mockState: {
    pages: [{}, {}] as unknown[],
    // Stands in for the pdf.js document Kendo parsed internally. Only
    // getData() matters: it is how the page borrows the downloaded bytes.
    document: { getData: () => Promise.resolve(new Uint8Array([1, 2, 3])) },
    // Called with the props Kendo receives on every render, for the zoom checks.
    received: vi.fn<(props: Record<string, unknown>) => void>(),
  },
}));

vi.mock('@progress/kendo-react-all', async () => {
  const React = await import('react');
  return {
    PDFViewer: React.forwardRef(
      (props: { onLoad?: () => void; url?: string }, ref: React.Ref<unknown>) => {
        mockState.received(props);
        React.useImperativeHandle(ref, () => ({
          element: null,
          props,
          pages: mockState.pages,
          document: mockState.document,
        }));
        // Kendo fires onLoad once the document is parsed; that is when the
        // component reaches for the page count.
        React.useEffect(() => {
          props.onLoad?.();
        }, []);
        return <div data-testid="kendo-pdfviewer" />;
      },
    ),
    scrollToPage: vi.fn(),
  };
});

// The placements have their own suites; here the viewer only has to report
// the document up and mount the right one.
vi.mock('../PdfAttachments', () => ({
  BottomBarAttachments: () => <div data-testid="bottom-bar" />,
  ToolbarAttachments: () => <div data-testid="toolbar-attachments" />,
}));

const defaultProps = {
  filePath: '/case.pdf',
  fileName: 'case.pdf',
  currentPage: 1,
  onPageChange: vi.fn(),
  onLoadSuccess: vi.fn(),
  onDocumentLoad: vi.fn(),
  isMobile: false,
  attachments: [],
  placement: 'bottom' as const,
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

  it('mounts only the placement it was given', async () => {
    const { rerender } = render(<KendoPdfViewer {...defaultProps} placement="bottom" />);
    await screen.findByTestId('kendo-pdfviewer');
    expect(screen.getByTestId('bottom-bar')).toBeInTheDocument();

    // 'details' renders in PdfDetails, so the viewer should show neither.
    rerender(<KendoPdfViewer {...defaultProps} placement="details" />);
    expect(screen.queryByTestId('bottom-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toolbar-attachments')).not.toBeInTheDocument();
  });

  /**
   * The fit itself needs a laid-out page, which jsdom does not have — that is
   * checked in a real browser and by fitWidthZoom's own suite. What can be
   * checked here is the wiring: who owns the zoom on each layout.
   */
  describe('zoom', () => {
    const lastProps = () => mockState.received.mock.lastCall![0];

    it('leaves the zoom to Kendo on desktop', async () => {
      render(<KendoPdfViewer {...defaultProps} isMobile={false} />);
      await screen.findByTestId('kendo-pdfviewer');

      expect(lastProps().zoom).toBeUndefined();
      expect(lastProps().defaultZoom).toBe(1);
    });

    it('controls the zoom on mobile, with a floor below the fitted value', async () => {
      render(<KendoPdfViewer {...defaultProps} isMobile />);
      await screen.findByTestId('kendo-pdfviewer');

      expect(lastProps().zoom).toBe(0.75);
      // Under Kendo's default 0.5, so a page fitted at ~0.47 is not below the
      // minimum — where zoom-out would jump in instead.
      expect(lastProps().minZoom).toBe(0.25);
    });

    it('keeps the zoom buttons working on mobile by feeding their change back in', async () => {
      render(<KendoPdfViewer {...defaultProps} isMobile />);
      await screen.findByTestId('kendo-pdfviewer');

      const onZoom = lastProps().onZoom as (event: { zoom: number }) => void;
      act(() => onZoom({ zoom: 1.25 }));

      expect(lastProps().zoom).toBe(1.25);
    });
  });
});
