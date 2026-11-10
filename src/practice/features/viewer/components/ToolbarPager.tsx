// Proposed, not in doc-viewer yet: our pager in the viewer's toolbar, in place
// of Kendo's 'pager' tool. Kendo's shows the page at the top edge of the view
// and has no prop to show another; this one is given the page by
// PDFDocViewer (useViewerPage) and asks it to scroll.
//
// Kendo's own Pager component, with the props Kendo's viewer gives it, so it
// looks and behaves the same: arrows, "Page [n] of 5", Enter and arrow keys.
import { Pager } from '@progress/kendo-react-all';

interface ToolbarPagerProps {
  // The page to show (0 = page 1)
  page: number;
  // How many pages; 0 until the document's pages have appeared
  total: number;
  // Called with the page asked for (0 = page 1)
  onPageChange: (page: number) => void;
}

export function ToolbarPager({ page, total, onPageChange }: ToolbarPagerProps) {
  // Kendo's Pager counts in items: skip = how many to pass over, take = how
  // many per page. With one page per "page", skip is the page index:
  //   skip 0 → "Page 1",  skip 4 → "Page 5"
  return (
    <Pager
      skip={page}
      take={1}
      total={total}
      type='input'
      previousNext
      info={false}
      // Like Kendo's: nothing to page through until the pages are there
      disabled={total === 0}
      // Only `skip` is read, so only it is typed: Kendo's PageChangeEvent
      // isn't exported by '@cmm-courts/ui', and an unknown type fails
      // doc-viewer's lint (no-unsafe-argument, no-unsafe-member-access)
      onPageChange={(event: { skip: number }) => onPageChange(event.skip)}
    />
  );
}
