import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import KendoPdfViewer from './KendoPdfViewer';

/**
 * Tests for the viewer wrapper itself. The attachments button it adds to the
 * toolbar has its own suite next to the component — what matters here is that
 * the viewer reports the page count, hands the parsed document over, and puts
 * that button in the toolbar.
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

// The indicators have their own suites; here the viewer only has to report
// the document up and put the toolbar one in Kendo's toolbar.
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

  it('adds the attachments indicator to the toolbar, and no bottom bar', async () => {
    render(<KendoPdfViewer {...defaultProps} />);
    await screen.findByTestId('kendo-pdfviewer');

    // The stand-in never calls onRenderToolbar itself, so call it the way
    // Kendo would, with a toolbar that already holds one built-in tool.
    const renderToolbar = mockState.received.mock.lastCall![0].onRenderToolbar as (
      toolbar: ReactElement,
    ) => ReactElement;
    expect(renderToolbar).toBeTypeOf('function');
    render(renderToolbar(<div><span data-testid="pager" /></div>));

    expect(screen.getByTestId('pager')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar-attachments')).toBeInTheDocument();
    expect(screen.queryByTestId('bottom-bar')).not.toBeInTheDocument();
  });

  /**
   * The fit itself needs a laid-out page, which jsdom does not have — that is
   * checked in a real browser and by fitWidthZoom's own suite. What can be
   * checked here is the wiring: who owns the zoom on each layout.
   */
  describe('zoom', () => {
    const lastProps = () => mockState.received.mock.lastCall![0];

    it('opens a desktop document at 100%', async () => {
      render(<KendoPdfViewer {...defaultProps} isMobile={false} />);
      await screen.findByTestId('kendo-pdfviewer');

      // Controlled on desktop too, so a page too wide for the viewer — the
      // desktop layout on a tablet — can be shrunk to fit.
      expect(lastProps().zoom).toBe(1);
    });

    it('opens a mobile document at 75% until it has been measured', async () => {
      render(<KendoPdfViewer {...defaultProps} isMobile />);
      await screen.findByTestId('kendo-pdfviewer');

      expect(lastProps().zoom).toBe(0.75);
    });

    it('sets the floor below any fitted value, on both layouts', async () => {
      // Under Kendo's default 0.5, so a page fitted at ~0.47 is not below the
      // minimum — where zoom-out would jump in instead.
      for (const isMobile of [true, false]) {
        const { unmount } = render(<KendoPdfViewer {...defaultProps} isMobile={isMobile} />);
        await screen.findByTestId('kendo-pdfviewer');
        expect(lastProps().minZoom).toBe(0.25);
        unmount();
      }
    });

    it('keeps the zoom controls working by feeding their change back in', async () => {
      render(<KendoPdfViewer {...defaultProps} isMobile />);
      await screen.findByTestId('kendo-pdfviewer');

      const onZoom = lastProps().onZoom as (event: { zoom: number }) => void;
      act(() => onZoom({ zoom: 1.25 }));

      expect(lastProps().zoom).toBe(1.25);
    });
  });
});
