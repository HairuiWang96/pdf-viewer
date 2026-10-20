import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, render, screen, cleanup, waitFor } from '@testing-library/react';
import { Children } from 'react';
import type { ReactElement, ReactNode } from 'react';
import PDFDocViewer from '.';
import { toolsDesktop, toolsMobile } from './PDFViewerTools';
import { ToolbarAttachments } from '../ToolbarAttachments';
import { useViewerStore } from '../../data/viewerStore';

/**
 * Tests for the viewer wrapper around KendoReact's PDFViewer.
 *
 * Kendo's PDFViewer needs a canvas and a pdf.js worker, and jsdom has neither,
 * so it is replaced with a fake. What is under test is our side of the
 * boundary: which props we hand Kendo (the PDF's bytes, the tools, the zoom),
 * the button we add to its toolbar, and when the page is fitted. Whether the
 * PDF actually draws, zooms or prints is Kendo's to test, and needs a real
 * browser.
 */

// vi.mock is hoisted above the imports, so the state it shares with the tests
// must be hoisted too.
// Typed up front rather than with `as` on each field.
const { mockState } = vi.hoisted(() => {
  const mockState: {
    document: unknown;
    element: HTMLElement | null;
    received: Mock<(props: Record<string, unknown>) => void>;
  } = { document: undefined, element: null, received: vi.fn() };
  return { mockState };
});

vi.mock('@progress/kendo-react-all', async () => {
  const React = await import('react');
  return {
    PDFViewer: React.forwardRef((props: { onLoad?: () => void }, ref: React.Ref<unknown>) => {
      mockState.received(props);
      React.useImperativeHandle(ref, () => ({
        document: mockState.document,
        element: mockState.element,
      }));
      // Once on mount, as Kendo fires onLoad once per loaded document. Held in
      // a ref so the effect needs no dependencies (and no lint exception).
      const onLoad = React.useRef(props.onLoad);
      React.useEffect(() => onLoad.current?.(), []);
      return <div data-testid="kendo-pdfviewer" />;
    }),
    // Shown instead of the viewer while the PDF downloads
    ProgressBar: () => <div data-testid="progress-bar" />,
  };
});

// Stands in for the pdf.js document Kendo parsed: a US Letter page, 612 pt wide.
const fakeDocument = {
  getData: () => Promise.resolve(new Uint8Array([1, 2, 3])),
  getPage: () => Promise.resolve({ getViewport: () => ({ width: 612 }) }),
};

// Kendo's root element with its scroll container inside, `width` px wide. jsdom does no layout, so clientWidth is set by hand;
// change it later with the returned function.
function fakeViewerElement(width: number) {
  const root = document.createElement('div');
  const scroller = document.createElement('div');
  scroller.className = 'k-pdf-viewer-canvas';
  root.appendChild(scroller);

  let current = width;
  Object.defineProperty(scroller, 'clientWidth', { get: () => current });
  return { root, setWidth: (next: number) => (current = next) };
}

// jsdom has no ResizeObserver. This one records its callback so a test can
// fire it after changing the fake element's width, as a browser would.
let resize: () => void = () => {};
class FakeResizeObserver {
  callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
  }
  observe() {
    resize = this.callback;
  }
  disconnect() {
    resize = () => {};
  }
}

// The PDF's bytes, as the document loader puts them in the store.
const pdfBytes = new Uint8Array([37, 80, 68, 70]); // "%PDF"

// Render with sensible defaults; each test overrides what it cares about.
function renderViewer(props: Partial<React.ComponentProps<typeof PDFDocViewer>> = {}) {
  return render(<PDFDocViewer document={pdfBytes} isMobile={false} {...props} />);
}

// The props the fake PDFViewer received on its latest render. Throws if it never rendered.
function viewerProps() {
  const props = mockState.received.mock.lastCall?.[0];
  if (!props) throw new Error('PDFViewer was never rendered');
  return props;
}

describe('PDFDocViewer', () => {
  beforeEach(() => {
    // No download in progress, so the viewer shows rather than the progress bar
    useViewerStore.setState({ isDocumentLoading: false });
    mockState.received.mockClear();
    mockState.document = fakeDocument;
    mockState.element = null;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  // Unmount after each test.
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('which document', () => {
    it('renders no viewer until the PDF has been downloaded', () => {
      // Kendo must not be mounted with nothing to load.
      renderViewer({ document: null });

      expect(screen.queryByTestId('kendo-pdfviewer')).not.toBeInTheDocument();
    });

    it('shows the progress bar, not the viewer, while the PDF downloads', () => {
      useViewerStore.setState({ isDocumentLoading: true });

      renderViewer();

      expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
      expect(screen.queryByTestId('kendo-pdfviewer')).not.toBeInTheDocument();
    });

     it('renders the viewer with the PDF’s bytes once they are downloaded', () => {
      renderViewer();

      expect(screen.getByTestId('kendo-pdfviewer')).toBeInTheDocument();
      expect(new Uint8Array(viewerProps().arrayBuffer as ArrayBuffer)).toEqual(pdfBytes);
    });

    it('hands the viewer a copy, not the store’s own bytes', () => {
      // pdf.js empties the buffer it is given. If that were the store's,
      // attachment reading and stamping would find it empty.
      renderViewer();

      expect(viewerProps().arrayBuffer).not.toBe(pdfBytes.buffer);
    });

    it('keeps the same copy across re-renders of the same document', () => {
      // A new buffer each render would make Kendo load the PDF again
      const { rerender } = renderViewer();
      const first = viewerProps().arrayBuffer;

      rerender(<PDFDocViewer document={pdfBytes} isMobile={false} />);

      expect(viewerProps().arrayBuffer).toBe(first);
    });
  });

  describe('toolbar', () => {
    it('adds the attachments button after Kendo’s own tools', () => {
      // `tools` only takes Kendo's built-in names, so the button is appended
      // to the toolbar Kendo renders. It reads the attachments from the store
      // itself, so it is added with no props.
      renderViewer();
      const renderToolbar = viewerProps().onRenderToolbar as (
        toolbar: ReactElement<{ children?: ReactNode }>,
      ) => ReactElement<{ children?: ReactNode }>;
      const kendoToolbar = (
        <div>
          <span key="pager" />
          <span key="zoom" />
        </div>
      );

      const children = Children.toArray(
        renderToolbar(kendoToolbar).props.children,
      ) as ReactElement[];

      expect(children).toHaveLength(3);
      expect(children.at(-1)?.type).toBe(ToolbarAttachments);
    });
  });

  describe('desktop and mobile', () => {
    // These check which list is chosen, not what is in it: the lists are a
    // design decision meant to change freely.
    // No element in these, so nothing can be measured and the opening zoom
    // stays put.
    it('uses the desktop tools at 100% zoom on desktop', () => {
      renderViewer({ isMobile: false });

      expect(viewerProps().tools).toEqual(toolsDesktop);
      expect(viewerProps().zoom).toBe(1);
    });

    it('uses the mobile tools at 50% zoom on mobile until it has been measured', () => {
      renderViewer({ isMobile: true });

      expect(viewerProps().tools).toEqual(toolsMobile);
      expect(viewerProps().zoom).toBe(0.5);
    });

    it('keeps the zoom buttons working by feeding their change back in', () => {
      renderViewer({ isMobile: true });

      const onZoom = viewerProps().onZoom as (event: { zoom: number }) => void;
      act(() => onZoom({ zoom: 1.25 }));

      expect(viewerProps().zoom).toBe(1.25);
    });
  });

  // Check the fit for desktop and mobile view
  describe('fit to width', () => {
    it('fits the page to a phone once the document loads', async () => {
      mockState.element = fakeViewerElement(390).root;
      renderViewer({ isMobile: true });

      // 390 / 816 = 0.478, rounded down
      await waitFor(() => expect(viewerProps().zoom).toBe(0.47));
    });

    it('shrinks a desktop page wider than the viewer', async () => {
      // The desktop layout on a tablet on its side
      mockState.element = fakeViewerElement(714).root;
      renderViewer({ isMobile: false });

      await waitFor(() => expect(viewerProps().zoom).toBe(0.87));
    });

    it('refits a phone even after zooming by hand', async () => {
      // Phone upright, 390 px wide: the page fits at 47%
      const viewer = fakeViewerElement(390);
      mockState.element = viewer.root;
      renderViewer({ isMobile: true });
      await waitFor(() => expect(viewerProps().zoom).toBe(0.47));

      // The user zooms to 150%, then turns the phone sideways (844 px wide)
      const onZoom = viewerProps().onZoom as (event: { zoom: number }) => void;
      act(() => onZoom({ zoom: 1.5 }));
      viewer.setWidth(844);
      act(() => resize());

      // Turning a phone always refits, so the 150% is replaced:
      // 844 / 816 = 1.034, rounded down
      await waitFor(() => expect(viewerProps().zoom).toBe(1.03));
    });

    it('keeps a desktop zoom set by hand when the window resizes', async () => {
      const viewer = fakeViewerElement(920);
      mockState.element = viewer.root;
      renderViewer({ isMobile: false });
      await act(async () => {});

      const onZoom = viewerProps().onZoom as (event: { zoom: number }) => void;
      act(() => onZoom({ zoom: 1.5 }));
      viewer.setWidth(714);
      act(() => resize());
      await act(async () => {});

      expect(viewerProps().zoom).toBe(1.5);
    });

    it('ignores a resize that does not change the width', async () => {
      // Mobile browsers resize the height whenever the address bar slides in
      // or out. Refitting on that would fight the reader's scrolling.
      const viewer = fakeViewerElement(390);
      mockState.element = viewer.root;
      renderViewer({ isMobile: true });
      await waitFor(() => expect(viewerProps().zoom).toBe(0.47));

      const onZoom = viewerProps().onZoom as (event: { zoom: number }) => void;
      act(() => onZoom({ zoom: 1.5 }));
      act(() => resize());
      await act(async () => {});

      expect(viewerProps().zoom).toBe(1.5);
    });
  });

  describe('when the PDF arrives after the page', () => {
    it('fits, and watches for width changes, once the viewer appears', async () => {
      // The page renders before the download finishes, so at first there is no
      // viewer to measure or watch. The resize watch has to start when the
      // bytes arrive, which is why the hook is keyed on them.
      const viewer = fakeViewerElement(390);
      mockState.element = viewer.root;
      const { rerender } = render(<PDFDocViewer isMobile document={null} />);

      rerender(<PDFDocViewer isMobile document={pdfBytes} />);
      await waitFor(() => expect(viewerProps().zoom).toBe(0.47));

      viewer.setWidth(844);
      act(() => resize());

      await waitFor(() => expect(viewerProps().zoom).toBe(1.03));
    });
  });
});
