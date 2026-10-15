import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, cleanup, waitFor } from '@testing-library/react';
import PDFDocViewer, { toolsDesktop, toolsMobile } from './PDFDocViewer';

/**
 * Tests for the viewer wrapper around KendoReact's PDFViewer.
 *
 * Kendo's PDFViewer needs a canvas and a pdf.js worker, and jsdom has neither,
 * so it is replaced with a fake. What is under test is our side of the
 * boundary: which props we hand Kendo, and what we hand our parent once Kendo
 * has loaded. Whether the PDF actually draws, zooms or prints is Kendo's to
 * test, and needs a real browser.
 *
 * The fake does four things:
 *   1. records the props it receives, for the url, tools and zoom tests
 *   2. exposes a `document` on its ref, as Kendo does once a PDF is parsed
 *   3. exposes an `element` holding Kendo's scroll container, for the fit
 *   4. calls onLoad when it mounts, as Kendo does once a PDF has loaded
 */

// vi.mock is hoisted above the imports, so the state it shares with the tests
// must be hoisted too.
const { mockState } = vi.hoisted(() => ({
  mockState: {
    document: undefined as unknown,
    element: null as HTMLElement | null,
    received: vi.fn<(props: Record<string, unknown>) => void>(),
  },
}));

vi.mock('@progress/kendo-react-all', async () => {
  const React = await import('react');
  return {
    PDFViewer: React.forwardRef((props: { onLoad?: () => void }, ref: React.Ref<unknown>) => {
      mockState.received(props);
      React.useImperativeHandle(ref, () => ({
        document: mockState.document,
        element: mockState.element,
      }));
      // Once on mount, as Kendo fires onLoad once per loaded document.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      React.useEffect(() => props.onLoad?.(), []);
      return <div data-testid='kendo-pdfviewer' />;
    }),
  };
});

/** Stands in for the pdf.js document Kendo parsed: a US Letter page, 612 pt wide. */
const fakeDocument = {
  getData: () => Promise.resolve(new Uint8Array([1, 2, 3])),
  getPage: () => Promise.resolve({ getViewport: () => ({ width: 612 }) }),
};

/**
 * Kendo's root element with its scroll container inside, `width` px wide.
 * jsdom does no layout, so clientWidth is set by hand; change it later with
 * the returned function.
 */
function fakeViewerElement(width: number) {
  const root = document.createElement('div');
  const scroller = document.createElement('div');
  scroller.className = 'k-pdf-viewer-canvas';
  root.appendChild(scroller);

  let current = width;
  Object.defineProperty(scroller, 'clientWidth', { get: () => current });
  return { root, setWidth: (next: number) => (current = next) };
}

/**
 * jsdom has no ResizeObserver. This one records its callback so a test can
 * fire it after changing the fake element's width, as a browser would. Only
 * once observe() is called, and not after disconnect(): a browser reports
 * nothing for an element nobody is watching.
 */
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

/** Render with sensible defaults; each test overrides what it cares about. */
function renderViewer(props: Partial<React.ComponentProps<typeof PDFDocViewer>> = {}) {
  const onDocumentLoad = vi.fn();

  render(
    <PDFDocViewer
      url='/case.pdf'
      isMobile={false}
      onDocumentLoad={onDocumentLoad}
      attachments={[]}
      readAttachment={() => null}
      {...props}
    />,
  );

  return { onDocumentLoad };
}

/** The props the fake PDFViewer received on its latest render. Throws if it never rendered. */
function viewerProps() {
  const props = mockState.received.mock.lastCall?.[0];
  if (!props) throw new Error('PDFViewer was never rendered');
  return props;
}

describe('PDFDocViewer', () => {
  beforeEach(() => {
    mockState.received.mockClear();
    mockState.document = fakeDocument;
    mockState.element = null;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  // Unmount after each test, or every render piles onto the same page.
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('which document', () => {
    it('renders no viewer when there is no url', () => {
      // The common case before a case number is chosen. Kendo must not be
      // mounted with nothing to load.
      renderViewer({ url: undefined });

      expect(screen.queryByTestId('kendo-pdfviewer')).not.toBeInTheDocument();
    });

    it('hands the url to the viewer', () => {
      // Not the helper's default, so this proves the prop is passed through
      // rather than coincidentally matching.
      renderViewer({ url: '/cases/CASE-2026-002.pdf' });

      expect(viewerProps().url).toBe('/cases/CASE-2026-002.pdf');
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

    it('sets the floor below any fitted value, on both layouts', () => {
      // Under Kendo's default 0.5, so zoom-out from a page fitted at ~0.47
      // zooms out instead of jumping in to 0.5.
      for (const isMobile of [true, false]) {
        renderViewer({ isMobile });
        expect(viewerProps().minZoom).toBe(0.25);
        cleanup();
      }
    });

    it('keeps the zoom buttons working by feeding their change back in', () => {
      renderViewer({ isMobile: true });

      const onZoom = viewerProps().onZoom as (event: { zoom: number }) => void;
      act(() => onZoom({ zoom: 1.25 }));

      expect(viewerProps().zoom).toBe(1.25);
    });
  });

  /**
   * The arithmetic has its own suite next to fitWidthZoom. These check the
   * wiring: when the viewer measures, and which way each layout may move.
   * All use a 612 pt Letter page, which is 816 px wide at 100%.
   */
  describe('fit to width', () => {
    it('fits the page to a phone once the document loads', async () => {
      mockState.element = fakeViewerElement(390).root;
      renderViewer({ isMobile: true });

      // 390 / 816 = 0.478, rounded down
      await waitFor(() => expect(viewerProps().zoom).toBe(0.47));
    });

    it('leaves a desktop page that already fits at 100%', async () => {
      mockState.element = fakeViewerElement(920).root;
      renderViewer({ isMobile: false });

      // Give the fit its chance to run, then check it did not grow the page
      await act(async () => {});
      expect(viewerProps().zoom).toBe(1);
    });

    it('shrinks a desktop page wider than the viewer', async () => {
      // The desktop layout on a tablet on its side
      mockState.element = fakeViewerElement(714).root;
      renderViewer({ isMobile: false });

      await waitFor(() => expect(viewerProps().zoom).toBe(0.87));
    });

    it('refits when a phone is turned sideways', async () => {
      // A sideways phone stays on the mobile layout (short and touch-driven,
      // see ViewerPage), so it fits uncapped: 844 / 816 = 1.03.
      const viewer = fakeViewerElement(390);
      mockState.element = viewer.root;
      renderViewer({ isMobile: true });
      await waitFor(() => expect(viewerProps().zoom).toBe(0.47));

      viewer.setWidth(844);
      act(() => resize());

      await waitFor(() => expect(viewerProps().zoom).toBe(1.03));
    });

    it('refits a phone even after zooming by hand', async () => {
      const viewer = fakeViewerElement(390);
      mockState.element = viewer.root;
      renderViewer({ isMobile: true });
      await waitFor(() => expect(viewerProps().zoom).toBe(0.47));

      const onZoom = viewerProps().onZoom as (event: { zoom: number }) => void;
      act(() => onZoom({ zoom: 1.5 }));
      viewer.setWidth(844);
      act(() => resize());

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

    /**
     * A tablet does cross the layout breakpoint when turned. An iPad mini is
     * 744 px upright, on the mobile layout (744 / 816 = 0.91), and 1133 px on
     * its side, on the desktop layout — too tall to count as a sideways phone —
     * where the fit is capped at 100%. Width and layout change together, and
     * which the viewer hears about first varies, so both orders are checked.
     */
    describe('crossing the layout breakpoint', () => {
      async function renderTablet() {
        const viewer = fakeViewerElement(744);
        mockState.element = viewer.root;
        const props = {
          url: '/case.pdf',
          onDocumentLoad: vi.fn(),
          attachments: [],
          readAttachment: () => null,
        };
        const { rerender } = render(<PDFDocViewer {...props} isMobile />);
        await waitFor(() => expect(viewerProps().zoom).toBe(0.91));

        const setLayout = (isMobile: boolean) =>
          rerender(<PDFDocViewer {...props} isMobile={isMobile} />);
        return { viewer, setLayout };
      }

      it('refits when the viewer resizes before the layout switches', async () => {
        const { viewer, setLayout } = await renderTablet();

        viewer.setWidth(1133);
        act(() => resize());
        setLayout(false);

        await waitFor(() => expect(viewerProps().zoom).toBe(1));
      });

      it('refits when the layout switches before the viewer resizes', async () => {
        // The order the resize watch alone missed: restarted by the switch, it
        // took 1133 as its baseline and the resize looked like no change.
        const { viewer, setLayout } = await renderTablet();

        viewer.setWidth(1133);
        setLayout(false);
        act(() => resize());

        await waitFor(() => expect(viewerProps().zoom).toBe(1));
      });

      it('refits when turned back upright into the mobile layout', async () => {
        const { viewer, setLayout } = await renderTablet();
        viewer.setWidth(1133);
        setLayout(false);
        await waitFor(() => expect(viewerProps().zoom).toBe(1));

        viewer.setWidth(744);
        setLayout(true);
        act(() => resize());

        await waitFor(() => expect(viewerProps().zoom).toBe(0.91));
      });
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

  describe('handing the document up', () => {
    it('passes the loaded document up to the parent', () => {
      // The audio attachments are read from this document. If the handoff
      // breaks they vanish with no error anywhere, so only this catches it.
      const { onDocumentLoad } = renderViewer();

      expect(onDocumentLoad).toHaveBeenCalledWith(fakeDocument);
    });

    it('passes null up when the viewer has no document', () => {
      // Set before rendering: the fake reads it when it mounts.
      mockState.document = undefined;

      const { onDocumentLoad } = renderViewer();

      // null, not undefined: `?? null` keeps the promise made by the prop type.
      expect(onDocumentLoad).toHaveBeenCalledWith(null);
    });
  });
});
