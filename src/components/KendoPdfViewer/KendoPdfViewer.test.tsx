import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { scrollToPage } from '@progress/kendo-react-all';
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

interface FakeViewerProps {
  onLoad?: () => void;
  onPageChange?: (event: { page: number }) => void;
  url?: string;
}

/**
 * `vi.hoisted` runs this block *before* the imports, so the vi.mock factory
 * below — which Vitest also moves to the very top of the file — can reach
 * `mockState` when it runs.
 *
 * A plain `const mockState = {...}` would not work. vi.mock calls are hoisted
 * above every import, so the factory would run first and find mockState still
 * undefined. vi.hoisted lifts the variable up there too, so the two arrive
 * together.
 */
const { mockState } = vi.hoisted(() => ({
  mockState: {
    pages: [{}, {}] as unknown[],
    // The props the fake viewer last received. Tests reach through this to
    // raise Kendo's own onPageChange, which is how a scroll or a toolbar
    // pager click arrives in the real component.
    props: null as FakeViewerProps | null,
  },
}));

vi.mock('@progress/kendo-react-all', async () => {
  const React = await import('react');
  return {
    PDFViewer: React.forwardRef((props: FakeViewerProps, ref: React.Ref<unknown>) => {
      const elementRef = React.useRef<HTMLDivElement>(null);
      mockState.props = props;

      // Getters, like the real component's handle — `element` has to be read
      // at call time, since the node does not exist when the handle is built.
      React.useImperativeHandle(ref, () => ({
        get element() {
          return elementRef.current;
        },
        props,
        get pages() {
          return mockState.pages;
        },
      }));

      // Kendo fires onLoad once the document is parsed; that is when the
      // component reaches for the page count.
      React.useEffect(() => {
        props.onLoad?.();
      }, []);

      return <div data-testid="kendo-pdfviewer" ref={elementRef} />;
    }),
    scrollToPage: vi.fn(),
  };
});

/** Raise Kendo's onPageChange, as scrolling or the toolbar pager would. */
function viewerScrollsTo(page: number) {
  act(() => {
    mockState.props?.onPageChange?.({ page });
  });
}

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

  /**
   * The page number lives in the parent, so this component never knows the
   * page — it gets told. Two things do the telling, and both arrive as the
   * same `currentPage` prop:
   *
   *   a thumbnail click   →  a real instruction  →  scroll
   *   the user scrolling  →  our own words back  →  sit still
   *
   * Nothing in the message distinguishes them, so the component keeps a note
   * of the page it is already showing and compares. See the long note in the
   * component for the full picture; these tests exercise both directions and
   * the comparison between them.
   *
   * None of it needs layout, so it is squarely testable here.
   */
  describe('page sync', () => {
    it('scrolls the viewer when the parent changes the page', async () => {
      const { rerender } = render(<KendoPdfViewer {...defaultProps} currentPage={1} />);
      await screen.findByTestId('kendo-pdfviewer');

      // A thumbnail click, arriving as a new prop.
      rerender(<KendoPdfViewer {...defaultProps} currentPage={3} />);

      // Kendo's onPageChange reports 1-based pages, but scrollToPage takes a
      // 0-based index — so page 3 is index 2. Asserting the argument rather
      // than just the call is what pins that conversion.
      expect(scrollToPage).toHaveBeenCalledWith(expect.any(HTMLElement), 2);
    });

    it('does not scroll when the page prop is unchanged', async () => {
      const { rerender } = render(<KendoPdfViewer {...defaultProps} currentPage={2} />);
      await screen.findByTestId('kendo-pdfviewer');
      vi.mocked(scrollToPage).mockClear();

      rerender(<KendoPdfViewer {...defaultProps} currentPage={2} />);

      expect(scrollToPage).not.toHaveBeenCalled();
    });

    it('reports a page change made in the viewer up to the parent', async () => {
      const onPageChange = vi.fn();
      render(<KendoPdfViewer {...defaultProps} onPageChange={onPageChange} />);
      await screen.findByTestId('kendo-pdfviewer');

      viewerScrollsTo(4);

      // One-based on the way up, matching what Kendo reported.
      expect(onPageChange).toHaveBeenCalledWith(4);
    });

    it('does not scroll back when the change came from the viewer itself', async () => {
      const onPageChange = vi.fn();
      const { rerender } = render(
        <KendoPdfViewer {...defaultProps} currentPage={1} onPageChange={onPageChange} />,
      );
      await screen.findByTestId('kendo-pdfviewer');
      vi.mocked(scrollToPage).mockClear();

      // The user scrolls to page 3; the parent stores it and sends it back
      // down. The component must recognise its own echo and sit still.
      viewerScrollsTo(3);
      rerender(
        <KendoPdfViewer {...defaultProps} currentPage={3} onPageChange={onPageChange} />,
      );

      // Without the guard this scrolls to the top of page 3 mid-flick, which
      // reads as the viewer fighting the user.
      expect(scrollToPage).not.toHaveBeenCalled();
    });

    it('still scrolls for a genuine change after one the viewer reported', async () => {
      const { rerender } = render(<KendoPdfViewer {...defaultProps} currentPage={1} />);
      await screen.findByTestId('kendo-pdfviewer');

      viewerScrollsTo(3);
      rerender(<KendoPdfViewer {...defaultProps} currentPage={3} />);
      vi.mocked(scrollToPage).mockClear();

      // A thumbnail click now. The guard must not have latched shut.
      rerender(<KendoPdfViewer {...defaultProps} currentPage={5} />);

      expect(scrollToPage).toHaveBeenCalledWith(expect.any(HTMLElement), 4);
    });
  });
});
