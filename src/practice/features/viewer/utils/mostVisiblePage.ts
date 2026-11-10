// Proposed, not in doc-viewer yet: the page number the toolbar's pager shows.
//
// Kendo's pager shows the page at the TOP EDGE of the view: scrollTop divided
// by one page's height (currentPage in kendo-pdfviewer-common). So with 30 px
// of page 1 left at the top and page 2 filling the rest, it still says 1, and
// zoomed out it can never reach the last pages: at 25%, scrolled to the bottom
// with pages 4 and 5 fully on screen, it says 3. This picks instead the page
// that takes up the most of the view.
//
// Kept out of the hook so it can be tested without a browser.

// How many pixels of each page are inside the scroll area, top to bottom.
// Both rectangles are on-screen positions, so their overlap is what shows.
export function visibleHeights(scroller: HTMLElement): number[] {
  const view = scroller.getBoundingClientRect();
  return Array.from(scroller.querySelectorAll('.k-page'), page => {
    const rect = page.getBoundingClientRect();
    return Math.max(0, Math.min(rect.bottom, view.bottom) - Math.max(rect.top, view.top));
  });
}

// The index (0 = page 1) of the page with the most pixels showing.
//
// A tie keeps `current`: zoomed out, several whole pages can show at once,
// all equally visible. Without this, clicking "next" at the bottom of the
// document, where the view can't scroll any further, would land on the page
// just clicked and then jump back to the first of the tied ones.
// For example, at 25%, pages 4 and 5 both show whole (264 px each):
//   mostVisiblePage([0, 0, 191, 264, 264], 4) → 4   (stays on page 5)
//   mostVisiblePage([0, 0, 191, 264, 264], 2) → 3   (page 4, the first of the tie)
export function mostVisiblePage(heights: number[], current: number): number {
  const most = Math.max(0, ...heights);
  if (most === 0 || heights[current] === most) return current;
  return heights.indexOf(most);
}
