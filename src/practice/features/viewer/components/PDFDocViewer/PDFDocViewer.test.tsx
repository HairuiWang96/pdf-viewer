// Practice copy of PDFDocViewer's tests from the other project
// (test/features/viewer/components/PDFDocViewer.test.tsx), pasted 2026-11-10.
//
// Changed from the original:
//   - imports are relative, and the fake Kendo components replace
//     '@progress/kendo-react-all' (doc-viewer: '@cmm-courts/ui')
//
// Proposed, not in doc-viewer yet (the "page number" tests):
//   - pager() finds our pager itself, with no second toolbarChildren()
//   - "puts our pager first in the toolbar" removed: the page-number tests
//     don't check the toolbar's contents
//   - "counts the pages once they have appeared" removed: "counts the pages
//     as soon as Kendo adds them" covers it, the way it happens in a browser
//   - "counts the pages when the viewer appears after the progress bar" no
//     longer waits out a timer: the download is now useIsFetching
//
// Proposed, not in doc-viewer yet (the keyboard bug report, 2026-11-12):
//   - "lets Tab reach every toolbar control", and a fake Pager in the mock
//     for it. Toolbar, ButtonGroup and Button come from
//     '@progress/kendo-react-buttons' here; in doc-viewer, from wherever it
//     gets the real (not mocked) ones
//
// Proposed, not in doc-viewer yet: the "download name" tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, render, screen, cleanup, waitFor } from '@testing-library/react';
import { Children } from 'react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import PDFDocViewer from '.';
import { toolsDesktop, toolsMobile } from './PDFViewerTools';
import { ToolbarAttachments } from '../ToolbarAttachments';
import { useViewerStore } from '../../data/viewerStore';
import { useIsFetching } from '@tanstack/react-query';
import { ToolbarPrint } from '../ToolbarPrint';
import { ToolbarPager } from '../ToolbarPager';
import { Button, ButtonGroup, Toolbar } from '@progress/kendo-react-buttons';

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

vi.mock('@tanstack/react-query');

// vi.mock is hoisted above the imports, so the state it shares with the tests
// must be hoisted too.
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
      const onLoad = React.useRef(props.onLoad);
      React.useEffect(() => onLoad.current?.(), []);
      return <div data-testid="kendo-pdfviewer" />;
    }),
    // Our pager's Kendo Pager, for tests that render the toolbar
    Pager: () => <div />,
    ProgressBar: () => <div role="progressbar" aria-label="progress" />,
    Loader: () => <div role="status"></div>,
    PDFViewerHandle: {},
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
// Two hooks watch sizes(the fit and the pager's page), so it keeps every callback
// being watched, and resize() fires them all.
const watching = new Set<() => void>();
const resize = () => watching.forEach((callback) => callback());
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
    vi.mocked(useIsFetching).mockReturnValue(0);
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
      vi.mocked(useIsFetching).mockReturnValue(1);

      renderViewer();

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByTestId('kendo-pdfviewer')).not.toBeInTheDocument();
    });

    it('shows the infinite spinner loader when there is no document response content-length header, while the PDF downloads', () => {
      useViewerStore.getState().setHasDocumentContentLengthHeader(false);
      vi.mocked(useIsFetching).mockReturnValue(1);

      renderViewer();

      expect(useViewerStore.getState().hasDocumentContentLengthHeader).toBeFalsy();
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();
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

  describe('download name', () => {
    afterEach(() => {
      useViewerStore.setState({ documentId: null, currentCaseNumber: undefined, attachments: [] });
    });

    it('names the download after the doc id and the selected case', () => {
      useViewerStore.setState({ documentId: 'DOC-123', currentCaseNumber: '2026-CR-00912' });

      renderViewer();

      expect(viewerProps().saveFileName).toBe('DOC-123-2026-CR-00912.pdf');
    });

    it('renames the download when another case is picked', () => {
      useViewerStore.setState({ documentId: 'DOC-123', currentCaseNumber: '2026-CR-00912' });
      renderViewer();

      act(() => useViewerStore.setState({ currentCaseNumber: '2026-CR-00555' }));

      expect(viewerProps().saveFileName).toBe('DOC-123-2026-CR-00555.pdf');
    });

    it('names the download after the doc id alone when no case is selected', () => {
      useViewerStore.setState({ documentId: 'DOC-123', currentCaseNumber: undefined });

      renderViewer();

      expect(viewerProps().saveFileName).toBe('DOC-123.pdf');
    });

    it('adds -with-audio once the PDF’s attachments have been read', () => {
      useViewerStore.setState({ documentId: 'DOC-123', currentCaseNumber: '2026-CR-00912' });
      renderViewer();

      act(() =>
        useViewerStore.setState({
          attachments: [{ name: 'case-note-audio.wav', filename: 'case-note-audio.wav' }],
        }),
      );

      expect(viewerProps().saveFileName).toBe('DOC-123-2026-CR-00912-with-audio.pdf');
    });

    it('leaves Kendo its default name when there is no doc id', () => {
      // undefined, not null: Kendo's default ("Document") is only used for undefined
      useViewerStore.setState({ documentId: null, currentCaseNumber: '2026-CR-00912' });

      renderViewer();

      expect(viewerProps().saveFileName).toBeUndefined();
    });
  });

  describe('toolbar', () => {
    function toolbarChildren() {
      const renderToolbar = viewerProps().onRenderToolbar as (
        toolbar: ReactElement<{ children?: ReactNode }>,
      ) => ReactElement<{ children?: ReactNode }>;
      const kendoToolbar = (
        <div>
          <span key="pager" />
          <span key="zoom" />
        </div>
      );

      return Children.toArray(renderToolbar(kendoToolbar).props.children) as ReactElement[];
    }

    // Which print the viewer uses depends on the browser, read from its
    // user-agent string, so each group says which browser it pretends to be.
    function pretendToBe(userAgent: string) {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('lets Tab reach every toolbar control', () => {
      // Kendo's toolbar makes all but one control unreachable by Tab
      // (tabindex -1) and moves between them with the arrow keys. In the
      // viewer that left zoom, selection, download and print unreachable, so
      // ours turns it off. The real Kendo Toolbar, shaped like PDFViewer's:
      // its zoom buttons in a button group, which is what its list matches.
      renderViewer();
      const renderToolbar = viewerProps().onRenderToolbar as (
        toolbar: ReactElement<{ children?: ReactNode }>,
      ) => ReactElement;
      render(
        renderToolbar(
          <Toolbar>
            <ButtonGroup>
              <Button title="Zoom out" />
              <Button title="Zoom in" />
            </ButtonGroup>
            <Button title="Download" />
          </Toolbar>,
        ),
      );

      for (const name of ['Zoom out', 'Zoom in', 'Download']) {
        expect(screen.getByTitle(name)).not.toHaveAttribute('tabindex', '-1');
      }
    });

    describe('in Chrome and Edge', () => {
      // Kendo's print makes pages that don't fit the paper (#3742), so these
      // get our own print button
      beforeEach(() => {
        pretendToBe(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        );
      });

      it('adds the print and attachments button after Kendo’s own tools', () => {
        renderViewer();
        const children = toolbarChildren();

        expect(children).toHaveLength(5);
        expect(children.at(-1)?.type).toBe(ToolbarAttachments);
        expect(children.at(-2)?.type).toBe(ToolbarPrint);
      });

      it('still has the whole PDF to print after pdf.js has emptied the viewer copy', () => {
        renderViewer();
        const viewerBuffer = viewerProps().arrayBuffer as ArrayBuffer;
        structuredClone(viewerBuffer, { transfer: [viewerBuffer] });

        expect(viewerBuffer.byteLength).toBe(0);

        const printButton = toolbarChildren().at(-2) as
          ReactElement<ComponentProps<typeof ToolbarPrint>> | undefined;

        expect(printButton?.props.document).toEqual(pdfBytes);
        expect(printButton?.props.document?.byteLength).toBe(4);
      });

      it('leaves Kendo own print tool out, on desktop and on mobile', () => {
        renderViewer({ isMobile: false });
        expect(toolsDesktop).not.toContain('print');

        cleanup();
        renderViewer({ isMobile: true });
        expect(toolsMobile).not.toContain('print');
      });
    });

    describe('in Firefox', () => {
      // Our print shows the PDF in a hidden frame, which Firefox downloads or
      // sends to Adobe (other tools) or set to "Open in Firefox" loop; Kendo's doesn't.
      beforeEach(() => {
        pretendToBe(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
        );
      });

      it('keeps Kendo’s own print tool, on desktop and on mobile', () => {
        renderViewer({ isMobile: false });
        expect(viewerProps().tools).toEqual([...toolsDesktop, 'print']);

        cleanup();
        renderViewer({ isMobile: true });
        expect(viewerProps().tools).toEqual([...toolsMobile, 'print']);
      });

      it('adds the attachments button, not ours for print', () => {
        renderViewer();

        const children = toolbarChildren();

        expect(children).toHaveLength(4);
        expect(children.map((child) => child.type)).not.toContain(ToolbarPrint);
        expect(children.at(-1)?.type).toBe(ToolbarAttachments);
      });
    });
  });

  describe('page number', () => {
    // Our pager (ToolbarPager) in place of Kendo's, which shows the page at
    // the top edge of the view. Ours shows the one that takes up the most of
    // it and scrolls to pages itself.

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
      // The farthest the view can scroll: the whole strip of pages minus the
      // 800 px view. startOf(heights.length) is where a page after the last
      // would start, i.e. the strip's end. 25%: 7 + 5 × (264 + 7) = 1362,
      // − 800 = 562. 0 when the pages are shorter than the view. A function,
      // so it follows zoomTo()'s new heights.
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

    // The props of our pager, in the toolbar we hand back to Kendo
    function pager() {
      const renderToolbar = viewerProps().onRenderToolbar as (
        toolbar: ReactElement<{ children?: ReactNode }>,
      ) => ReactElement<{ children?: ReactNode }>;
      const children = Children.toArray(renderToolbar(<div />).props.children) as ReactElement[];
      const found = children.find((child) => child.type === ToolbarPager);
      if (!found) throw new Error('no pager in the toolbar');
      return found.props as ComponentProps<typeof ToolbarPager>;
    }

    // Renders the viewer around the fake, and measures it once, as a browser's
    // ResizeObserver does as soon as it starts (jsdom's fake doesn't)
    function renderWith(viewer: ReturnType<typeof fakeScrollingViewer>) {
      mockState.element = viewer.root;
      renderViewer();
      act(() => resize());
    }

    it('counts the pages as soon as Kendo adds them, with no scroll or resize', async () => {
      // The viewer is on screen before its pages: Kendo adds them after
      // reading the PDF. In doc-viewer the pages box growing didn't report
      // it, and the pager said "Page 1 of 0" until the first scroll. So here
      // no resize() is fired after the pages arrive.
      const viewer = fakeScrollingViewer(letter100);
      const pagesBox = viewer.root.querySelector('.k-pdf-viewer-pages')!;
      const pages = [...pagesBox.children];
      pages.forEach((page) => page.remove());
      renderWith(viewer);
      expect(pager().total).toBe(0);

      // Kendo adds the pages. A MutationObserver reports a moment later, so
      // wait for it, as the fit tests wait for theirs
      pagesBox.append(...pages);
      await act(async () => {});

      expect(pager().total).toBe(5);
    });

    it('counts the pages when the viewer appears after the progress bar', () => {
      // The bytes arrive while the download still shows, so there is no
      // viewer to watch yet; when it appears the bytes are the same. Watching
      // from the bytes alone left the pager at "Page 1 of 0" (seen in doc-viewer).
      mockState.element = fakeScrollingViewer(letter100).root;
      vi.mocked(useIsFetching).mockReturnValue(1);
      const { rerender } = renderViewer();
      expect(screen.queryByTestId('kendo-pdfviewer')).not.toBeInTheDocument();

      // The download finishes: same bytes, and now the viewer
      vi.mocked(useIsFetching).mockReturnValue(0);
      rerender(<PDFDocViewer document={pdfBytes} isMobile={false} />);
      expect(screen.getByTestId('kendo-pdfviewer')).toBeInTheDocument();
      act(() => resize());

      expect(pager().total).toBe(5);
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
      const viewer = fakeViewerElement(390);
      mockState.element = viewer.root;
      renderViewer({ isMobile: true });
      await waitFor(() => expect(viewerProps().zoom).toBe(0.47));

      const onZoom = viewerProps().onZoom as (event: { zoom: number }) => void;
      act(() => onZoom({ zoom: 1.5 }));

      // Turn the pone sideways, and it will refits and replace 150%
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

      rerender(<PDFDocViewer isMobile document={pdfBytes} />);
      await waitFor(() => expect(viewerProps().zoom).toBe(0.47));

      viewer.setWidth(844);
      act(() => resize());

      await waitFor(() => expect(viewerProps().zoom).toBe(1.03));
    });
  });
});
