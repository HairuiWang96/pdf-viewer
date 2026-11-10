import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { PDFViewerHandle } from '@progress/kendo-react-all';
import { mostVisiblePage, visibleHeights } from '../utils/mostVisiblePage';

// Proposed, not in doc-viewer yet.
//
// Everything our toolbar pager (ToolbarPager) needs, in place of Kendo's own
// pager, whose number is the page at the top edge of the view (see
// utils/mostVisiblePage.ts):
//   - page: the page that takes up the most of the view (0 = page 1)
//   - total: how many pages the document has (0 until they have appeared)
//   - goToPage: scrolls to a page, for the pager's arrows and typed numbers
//
// `loadKey` re-arms the watch: pass something that changes each time Kendo
// has loaded a document (PDFDocViewer counts its onLoads). Only then is the
// viewer surely on screen to be watched.
export function useViewerPage(viewerRef: RefObject<PDFViewerHandle | null>, loadKey: unknown) {
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  // Remeasure when:
  //   - the view scrolls
  //   - pages are added or removed: after the load, and on every zoom, since
  //     Kendo rebuilds the pages for it (MutationObserver)
  //   - the pages change size: a zoom
  //   - the view changes size: a window resize, the details drawer opening
  // A ResizeObserver also reports once as soon as it starts, which measures
  // a new document from its top.
  //
  // The MutationObserver is what counts the pages once Kendo has added them.
  // The pages box growing (ResizeObserver) did it here, but not in doc-viewer:
  // its pager stayed at "Page 1 of 0" until the first scroll.
  useEffect(() => {
    const scroller = findScroller(viewerRef);
    if (!scroller) return;

    const update = () => {
      const heights = visibleHeights(scroller);
      setTotal(heights.length);
      // A function of the page shown so far, so a tie can keep it
      setPage(current => mostVisiblePage(heights, current));
    };
    //‼️ passive: a promise never to stop the scroll, so the browser needn't wait for us
    scroller.addEventListener('scroll', update, { passive: true });

    // childList: elements added or removed; subtree: anywhere inside, so it
    // doesn't depend on which box Kendo puts the pages in. The browser hands
    // over a whole batch of changes in one call, not one call per element.
    const pagesAdded = new MutationObserver(update);
    pagesAdded.observe(scroller, { childList: true, subtree: true });

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update);
      observer.observe(scroller);
      const pages = scroller.querySelector('.k-pdf-viewer-pages');
      if (pages) observer.observe(pages);
    }

    return () => {
      scroller.removeEventListener('scroll', update);
      pagesAdded.disconnect();
      observer?.disconnect();
    };
  }, [viewerRef, loadKey]);

  // Scrolls so the page's top sits where page 1's does at the start, with the
  // same gap above it. Each page's own position, not Kendo's "page 1's height
  // × page number", so it also lands right when pages differ in size (a
  // landscape page among portrait ones).
  //
  // setPage too: zoomed out, the view may not be able to scroll that far
  // (pages 4 and 5 both on screen at the bottom), and the pager should still
  // show the page asked for. The scroll that follows keeps it, as a tie.
  const goToPage = useCallback(
    (index: number) => {
      const scroller = findScroller(viewerRef);
      const pages = scroller?.querySelectorAll<HTMLElement>('.k-page');
      const target = pages?.[index];
      if (!scroller || !pages || !target) return;
      setPage(index);
      // Hide everything above the page except page 1's gap, so the page sits
      // where page 1 does at the start. Page 4 at 100%: 3280 − 28 = 3252
      scroller.scrollTop = target.offsetTop - pages[0].offsetTop;
    },
    [viewerRef],
  );

  return { page, total, goToPage };
}

// Kendo's scroll area, which holds the pages
function findScroller(viewerRef: RefObject<PDFViewerHandle | null>) {
  return viewerRef.current?.element?.querySelector<HTMLElement>('.k-pdf-viewer-canvas') ?? null;
}
