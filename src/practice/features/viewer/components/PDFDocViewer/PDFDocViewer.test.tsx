import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, render, screen, cleanup, waitFor } from '@testing-library/react';
import { Children } from 'react';
import type { ReactElement, ReactNode } from 'react';
import PDFDocViewer from '.';
import { toolsDesktop, toolsMobile } from './PDFViewerTools';
import { ToolbarAttachments } from '../ToolbarAttachments';
import { ToolbarPager } from '../ToolbarPager';
import { ToolbarPrint } from '../ToolbarPrint';
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
//
//‼️ `received` is a mock function (vi.fn()): ‼️ a fake that remembers every call.
//   Mock<(props: Record<string, unknown>) => void>   Vitest's mock type; inside
//   the < > is the function it pretends to be: one argument, props (an object
//   with string keys and values of any type), returning nothing.
// How the tests use it:
//   1. records:  the fake PDFViewer calls received(props) on every render‼️
//   2. reads:    viewerProps() takes received.mock.lastCall?.[0]: .mock holds
//                the records, .lastCall the latest call's arguments, [0] the
//                props. So viewerProps().zoom = the zoom last passed to Kendo.
//   3. resets:   beforeEach's mockClear() forgets old calls between tests
// ‼️ The fake PDFViewer is the only thing that sees the props PDFDocViewer
// passes; this is how the tests get them back out.
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
    // props: PDFDocViewer writes <PDFViewer zoom={zoom} onLoad={handleLoad} … />,
    // and React collects those attributes (all but ref) into ONE object,
    // { zoom: 1, onLoad: handleLoad, … }, and calls this fake with it.
    // (props, ref) => …: two parameters; forwardRef adds the second, ref, so
    // the fake also gets viewerRef. `props: { onLoad?: () => void }` is a
    // TypeScript type on the parameter: an object that may (?) have onLoad, a
    // function taking nothing and returning nothing. It names only onLoad, the
    // one prop read below by name; ‼️ at runtime props still holds every prop,
    // which is why received(props) records them all.
    //
    //   PDFDocViewer  <PDFViewer onLoad={handleLoad} />
    //   React         calls the fake with props = { onLoad: handleLoad, … }
    //   here          (props, ref) => …     receives the object
    //   below         props.onLoad          takes handleLoad out of it
    //                 onLoad.current?.()    calls it once → fitToWidth()‼️
    PDFViewer: React.forwardRef((props: { onLoad?: () => void }, ref: React.Ref<unknown>) => {
      mockState.received(props);
      // ‼️ useImperativeHandle lets a component choose what a parent's ref points
      // to: instead of a DOM element, ‼️ "give them this object". (It needs
      // forwardRef above, so the component receives the ref at all.) ‼️ Here
      // PDFDocViewer's viewerRef.current becomes { document, element }, the
      // same shape the real Kendo PDFViewer gives: useFitWidthZoom calls
      // document.getPage(1) for the page width and measures element. Without
      // it the fake would hand back nothing, and fitting would find nothing.
      React.useImperativeHandle(ref, () => ({
        document: mockState.document,
        element: mockState.element,
      }));
      // Once on mount, as Kendo fires onLoad once per loaded document. Held in
      // a ref so the effect needs no dependencies (and no lint exception).
      const onLoad = React.useRef(props.onLoad);
      React.useEffect(() => onLoad.current?.(), []);
      return <div data-testid='kendo-pdfviewer' />;
    }),
    // Shown instead of the viewer while the PDF downloads
    ProgressBar: () => <div data-testid='progress-bar' />,
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
  // setWidth(844) sets `current`, so clientWidth now reports 844. Both it and
  // the getter above share `current` even after this function has returned
  // (a closure: a function keeps the variables around where it was made).
  // An arrow without { } returns what follows =>; the parentheses mark the
  // assignment as meant, not a typo for ===. Same as { current = next; }.
  return { root, setWidth: (next: number) => (current = next) };
}

// jsdom has no ResizeObserver. This one records its callback so a test can
// fire it after changing the fake element's width, as a browser would.
// A class because the hook creates it with `new ResizeObserver(callback)`.
// Two hooks watch sizes (the fit and the pager's page), so it keeps every
// callback being watched, and resize() fires them all.
const watching = new Set<() => void>();
const resize = () => watching.forEach(callback => callback());
class FakeResizeObserver {
  callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
  }
  observe() {
    watching.add(this.callback);
  }
  disconnect() {
    watching.delete(this.callback);
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
  //
  //‼️ cleanup() (Testing Library) removes everything render() put on the page:
  // it unmounts each component, so React runs all its cleanups (effects,
  // listeners, the ResizeObserver disconnected), and removes the <div>s it
  // added to <body>. All tests in a file share one jsdom page; without it the
  // next test would find two viewers, and the old one's effects could still
  // fire. vi.unstubAllGlobals() puts the real globals back.
  //
  // Here it runs twice: src/test/setup.ts calls cleanup() after every test in
  // every file, and `globals: true` makes Testing Library do it too. Harmless,
  // and it keeps this file working on its own, e.g. in doc-viewer.
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
    // The children of the toolbar we hand back to Kendo, given a Kendo
    // toolbar with two tools of its own.
    function toolbarChildren() {
      const renderToolbar = viewerProps().onRenderToolbar as (toolbar: ReactElement<{ children?: ReactNode }>) => ReactElement<{ children?: ReactNode }>;
      const kendoToolbar = (
        <div>
          <span key='pager' />
          <span key='zoom' />
        </div>
      );
      return Children.toArray(renderToolbar(kendoToolbar).props.children) as ReactElement<{
        document?: Uint8Array;
      }>[];
    }

    // Which print the viewer uses depends on the browser, read from its
    // user-agent string, so each group says which browser it pretends to be.
    function pretendToBe(userAgent: string) {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('in Chrome and Edge', () => {
      // Kendo's print makes pages that don't fit the paper (#3742), so these
      // get our own print button
      beforeEach(() => {
        pretendToBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
      });

      it('adds the print and attachments buttons after Kendo’s own tools', () => {
        // `tools` only takes Kendo's built-in names, so the buttons are appended
        // to the toolbar Kendo renders. The attachments button reads the store
        // itself, so it is added with no props.
        renderViewer();

        const children = toolbarChildren();

        // Our pager, Kendo's two, print, attachments
        expect(children).toHaveLength(5);
        expect(children.at(-2)?.type).toBe(ToolbarPrint);
        expect(children.at(-1)?.type).toBe(ToolbarAttachments);
      });

      it('still has the whole PDF to print after pdf.js has emptied the viewer’s copy', () => {
        // pdf.js takes over the buffer the viewer is given, leaving it empty
        // (0 bytes). Printing that copy printed an empty file: Edge showed
        // "We can't open this file".
        renderViewer();
        const viewerBuffer = viewerProps().arrayBuffer as ArrayBuffer;
        structuredClone(viewerBuffer, { transfer: [viewerBuffer] }); // empties it, as pdf.js does
        expect(viewerBuffer.byteLength).toBe(0);

        const printButton = toolbarChildren().at(-2);

        // The same PDF the viewer shows, so the printout matches the screen
        expect(printButton?.props.document).toEqual(pdfBytes);
        expect(printButton?.props.document?.byteLength).toBe(4);
      });

      it('leaves Kendo’s own print tool out, on desktop and on mobile', () => {
        renderViewer({ isMobile: false });
        expect(viewerProps().tools).not.toContain('print');

        cleanup();
        renderViewer({ isMobile: true });
        expect(viewerProps().tools).not.toContain('print');
      });
    });

    describe('in Firefox', () => {
      // Our print shows the PDF in a hidden frame, which Firefox downloads or
      // sends to Adobe unless set to "Open in Firefox"; Kendo's doesn't.
      beforeEach(() => {
        pretendToBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0');
      });

      it('keeps Kendo’s own print tool, on desktop and on mobile', () => {
        renderViewer({ isMobile: false });
        expect(viewerProps().tools).toEqual([...toolsDesktop, 'print']);

        cleanup();
        renderViewer({ isMobile: true });
        expect(viewerProps().tools).toEqual([...toolsMobile, 'print']);
      });

      it('adds only the attachments button, not ours for print', () => {
        renderViewer();

        const children = toolbarChildren();

        // Our pager, Kendo's two, attachments
        expect(children).toHaveLength(4);
        expect(children.map(child => child.type)).not.toContain(ToolbarPrint);
        expect(children.at(-1)?.type).toBe(ToolbarAttachments);
      });
    });
  });

  describe('page number', () => {
    // Our pager (ToolbarPager) in place of Kendo's, which shows the page at
    // the top edge of the view. Ours shows the one that takes up the most of
    // it (utils/mostVisiblePage.ts) and scrolls to pages itself.

    // Kendo's root element with pages of the given heights in an 800 px tall
    // scroll area, `gap` px between them. jsdom does no layout, so each page's
    // position is worked out from the heights and `scrollTop` by hand:
    //   offsetTop               where the page starts inside the scroll area
    //   getBoundingClientRect   where it is on screen, after scrolling
    // Setting scrollTop (ours does, a browser's wheel does) stops at the
    // bottom and fires the scroll event, as a browser would. zoomTo() changes
    // the heights without one, as a zoom can.
    function fakeScrollingViewer(pageHeights: number[], gap = 28) {
      const root = document.createElement('div');
      const scroller = document.createElement('div');
      scroller.className = 'k-pdf-viewer-canvas';
      const pagesBox = document.createElement('div');
      pagesBox.className = 'k-pdf-viewer-pages';
      root.appendChild(scroller);
      scroller.appendChild(pagesBox);

      let heights = pageHeights;
      // Page i starts after the gap and every page above it with its gap
      const startOf = (i: number) => gap + heights.slice(0, i).reduce((sum, h) => sum + h + gap, 0);
      const maxScroll = () => Math.max(0, startOf(heights.length) - 800);

      let scrollTop = 0;
      Object.defineProperty(scroller, 'scrollTop', {
        get: () => scrollTop,
        set: (y: number) => {
          scrollTop = Math.min(Math.max(0, y), maxScroll());
          scroller.dispatchEvent(new Event('scroll'));
        },
      });
      scroller.getBoundingClientRect = () => ({ top: 0, bottom: 800 }) as DOMRect;

      heights.forEach((_, i) => {
        const page = document.createElement('div');
        page.className = 'k-page';
        Object.defineProperty(page, 'offsetTop', { get: () => startOf(i) });
        page.getBoundingClientRect = () => {
          const top = startOf(i) - scrollTop;
          return { top, bottom: top + heights[i] } as DOMRect;
        };
        pagesBox.appendChild(page);
      });

      return {
        root,
        scrollTo: (y: number) => act(() => void (scroller.scrollTop = y)),
        scrollTop: () => scrollTop,
        zoomTo: (nextHeights: number[]) => (heights = nextHeights),
      };
    }

    // Five US Letter pages at 100%, and at 25% (Kendo's gap is 7 px there)
    const letter100 = [1056, 1056, 1056, 1056, 1056];
    const letter25 = [264, 264, 264, 264, 264];

    // The toolbar we hand back to Kendo, given a Kendo toolbar with one tool
    function toolbarChildren() {
      const renderToolbar = viewerProps().onRenderToolbar as (toolbar: ReactElement<{ children?: ReactNode }>) => ReactElement<{ children?: ReactNode }>;
      const kendoToolbar = (
        <div>
          <span key='zoom' />
        </div>
      );
      return Children.toArray(renderToolbar(kendoToolbar).props.children) as ReactElement<React.ComponentProps<typeof ToolbarPager>>[];
    }

    // The props of our pager in that toolbar
    function pager() {
      const found = toolbarChildren().find(child => child.type === ToolbarPager);
      if (!found) throw new Error('no pager in the toolbar');
      return found.props;
    }

    // Renders the viewer around the fake, and measures it once, as a browser's
    // ResizeObserver does as soon as it starts (jsdom's fake doesn't)
    function renderWith(viewer: ReturnType<typeof fakeScrollingViewer>) {
      mockState.element = viewer.root;
      renderViewer();
      act(() => resize());
    }

    it('puts our pager first in the toolbar, where Kendo’s was', () => {
      renderViewer();

      expect(toolbarChildren()[0]?.type).toBe(ToolbarPager);
      expect(toolsDesktop).not.toContain('pager');
      expect(toolsMobile).not.toContain('pager');
    });

    it('counts the pages once they have appeared', () => {
      // Before that its arrows are disabled (ToolbarPager's own tests)
      mockState.element = fakeScrollingViewer(letter100).root;
      renderViewer();
      expect(pager().total).toBe(0);

      act(() => resize());

      expect(pager().total).toBe(5);
    });

    it('counts the pages as soon as Kendo adds them, with no scroll or resize', async () => {
      // The viewer is on screen before its pages: Kendo adds them after
      // reading the PDF. In doc-viewer the pages box growing didn't report
      // it, and the pager said "Page 1 of 0" until the first scroll. So here
      // no resize() is fired after the pages arrive.
      const viewer = fakeScrollingViewer(letter100);
      const pagesBox = viewer.root.querySelector('.k-pdf-viewer-pages')!;
      const pages = [...pagesBox.children];
      pages.forEach(page => page.remove());
      renderWith(viewer);
      expect(pager().total).toBe(0);

      // A MutationObserver reports after the current task, hence async act
      await act(async () => pagesBox.append(...pages));

      expect(pager().total).toBe(5);
    });

    it('counts the pages when the viewer appears after the progress bar', async () => {
      // The bytes arrive while the progress bar shows, so there is no viewer
      // to watch yet; when it appears the bytes are the same. Watching from
      // the bytes alone left the pager at "Page 1 of 0" (seen in doc-viewer).
      vi.useFakeTimers();
      try {
        mockState.element = fakeScrollingViewer(letter100).root;
        useViewerStore.setState({ isDocumentLoading: true });
        renderViewer();
        expect(screen.getByTestId('progress-bar')).toBeInTheDocument();

        // The download finishes; the progress bar runs its 3.2 s to the end
        useViewerStore.setState({ isDocumentLoading: false });
        await act(() => vi.advanceTimersByTimeAsync(3300));
        expect(screen.getByTestId('kendo-pdfviewer')).toBeInTheDocument();
        act(() => resize());

        expect(pager().total).toBe(5);
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows the page that fills most of the view, not the one at the top edge', () => {
      // Scrolled 750 px, page 1 shows its last 334 px and page 2 its first
      // 442: Kendo would still say page 1.
      const viewer = fakeScrollingViewer(letter100);
      renderWith(viewer);
      expect(pager().page).toBe(0);

      viewer.scrollTo(750);

      expect(pager().page).toBe(1);
    });

    it('remeasures when the pages change size without a scroll', () => {
      // A zoom out leaves scrollTop where it was but moves every page up
      const viewer = fakeScrollingViewer(letter100);
      renderWith(viewer);
      viewer.scrollTo(750);

      viewer.zoomTo(letter25);
      act(() => resize());

      // At 264 px, 750 px down shows page 3's last 126 px, then pages 4 and 5
      // whole: page 4, the first of the two
      expect(pager().page).toBe(3);
    });

    it('scrolls to the page asked for, with the gap above it that page 1 has', () => {
      const viewer = fakeScrollingViewer(letter100);
      renderWith(viewer);

      act(() => pager().onPageChange(3));

      // Page 4 starts at 28 + 3 × (1056 + 28) = 3280; page 1 at 28
      expect(viewer.scrollTop()).toBe(3252);
      expect(pager().page).toBe(3);
    });

    it('scrolls to the right place when the pages differ in size', () => {
      // Page 2 is landscape. Kendo's own arrows would scroll to
      // 2 × (1056 + 28) = 2168, 212 px into page 3.
      const viewer = fakeScrollingViewer([1056, 816, 1056, 1056, 1056]);
      renderWith(viewer);

      act(() => pager().onPageChange(2));

      // Page 3 starts at 28 + 1084 + 844 = 1956; page 1 at 28
      expect(viewer.scrollTop()).toBe(1928);
      expect(pager().page).toBe(2);
    });

    it('keeps the page asked for when the view cannot scroll to it', () => {
      // 25%: the view can't scroll further than pages 4 and 5 both whole
      const viewer = fakeScrollingViewer(letter25, 7);
      renderWith(viewer);
      viewer.scrollTo(10_000);
      expect(pager().page).toBe(3); // page 4, the first of the two

      act(() => pager().onPageChange(4));

      // The scroll stopped at the bottom, a tie between pages 4 and 5
      expect(viewer.scrollTop()).toBe(562);
      expect(pager().page).toBe(4);
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
      //‼️  act() tells React: "I'm changing something; finish every update it
      // causes before the test carries on." ‼️ React queues a state change
      // (here setZoom(1.25)) instead of re-rendering at once; act makes it
      // process the queue now, so the expect below sees the new zoom.
      //   act(() => …)                 a change that happens right away
      //                                (onZoom, the fake resize())
      //   await act(async () => {})    nothing to do, just let pending async
      //                                work finish (fitToWidth's getPage)
      // ‼️ render, rerender, fireEvent and waitFor wrap themselves in act already;
      // write it only for changes made outside them, like calling a prop.
      act(() => onZoom({ zoom: 1.25 }));

      expect(viewerProps().zoom).toBe(1.25);
    });
  });

  // Check the fit for desktop and mobile view
  describe('fit to width', () => {
    it('fits the page to a phone once the document loads', async () => {
      mockState.element = fakeViewerElement(390).root;
      renderViewer({ isMobile: true });

      // 390 / 816 = 0.478, rounded down.
      //
      // Why async, await AND waitFor. The fit lands a moment after render:
      // onLoad → fitToWidth() → await getPage(1) → setZoom(0.47) → re-render,
      // so right after renderViewer the zoom is still the opening 0.5.
      //   waitFor‼️ retries the check (every 50 ms) until it passes, or 1 s runs out
      //   await     pauses the test until waitFor is done; without it the test
      //             ends at once and passes having checked nothing
      //   async     lets the test use await; Vitest then waits for the test too
      // A plain expect(…) without waitFor would check once, see 0.5 and fail.
      // The other fit tests use the same pattern.
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
      // On a phone, the address bar slides in and out as you scroll. That
      // changes the viewer's height, so the ResizeObserver fires. But the
      // width didn't change, so there's no reason to refit. Refitting would
      // jump the zoom back while the person is reading.
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

    it('refits when the layout switches to mobile, even after zooming by hand', async () => {
      // A desktop window, 920 px: the page already fits at 100%. The user
      // zooms to 150%, then snaps the window narrow, so the layout turns mobile.
      const viewer = fakeViewerElement(920);
      mockState.element = viewer.root;
      const { rerender } = renderViewer({ isMobile: false });
      await act(async () => {});
      const onZoom = viewerProps().onZoom as (event: { zoom: number }) => void;
      act(() => onZoom({ zoom: 1.5 }));

      // The switch restarts the resize watch at the new width, so its report
      // sees no change; only the layout switch itself can refit here.
      viewer.setWidth(640);
      //‼️ `isMobile` with no value means true in JSX: same as isMobile={true}.
      // false must be written out (isMobile={false}); leaving the prop off
      // gives undefined, not false. Works for any boolean prop: parentTitle,
      // filterable, and <audio controls autoPlay> elsewhere in this code.
      rerender(<PDFDocViewer document={pdfBytes} isMobile />);
      act(() => resize());

      // 640 / 816 = 0.784, rounded down
      await waitFor(() => expect(viewerProps().zoom).toBe(0.78));
    });

    it('refits when the layout switches back to desktop', async () => {
      const viewer = fakeViewerElement(390);
      mockState.element = viewer.root;
      const { rerender } = renderViewer({ isMobile: true });
      await waitFor(() => expect(viewerProps().zoom).toBe(0.47));

      // Wide again: a desktop page that fits is shown at 100%, its cap
      viewer.setWidth(920);
      rerender(<PDFDocViewer document={pdfBytes} isMobile={false} />);

      await waitFor(() => expect(viewerProps().zoom).toBe(1));
    });

    it('keeps the opening zoom while the viewer has no width', async () => {
      // A hidden viewer measures 0 px wide; fitting to that would make no
      // sense, so the zoom it opened at stays.
      mockState.element = fakeViewerElement(0).root;
      renderViewer({ isMobile: true });
      await act(async () => {});

      expect(viewerProps().zoom).toBe(0.5);
    });
  });

  describe('when the PDF arrives after the page', () => {
    it('fits, and watches for width changes, once the viewer appears', async () => {
      // The page renders before the download finishes, so at first there is no
      // viewer to measure or watch. The resize watch has to start when the
      // bytes arrive, which is why the hook is keyed on them.
      const viewer = fakeViewerElement(390);
      mockState.element = viewer.root;
      const { rerender } = renderViewer({ isMobile: true, document: null });

      // rerender, not a second render. rerender gives the SAME component new
      // props, keeping its state, refs and effects, as ViewerPage does when the
      // bytes arrive. render again would mount a SECOND, brand-new component
      // beside the first, with the PDF from its very first render: its watch
      // would find the viewer at once, so the test would pass even without
      // the documentKey fix, and two viewers would both write to received and
      // resize. Same component, new props → rerender; a fresh start → a new test.
      rerender(<PDFDocViewer isMobile document={pdfBytes} />);
      await waitFor(() => expect(viewerProps().zoom).toBe(0.47));

      viewer.setWidth(844);
      act(() => resize());

      await waitFor(() => expect(viewerProps().zoom).toBe(1.03));
    });
  });
});
