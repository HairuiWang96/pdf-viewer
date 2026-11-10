import type { PDFViewerTool } from '@progress/kendo-react-all';

// Kendo toolbar tools for each layout. Kept out of PDFDocViewer.tsx so that
// file exports only a component, which React's fast refresh needs.
//
// Changed (proposed, not in doc-viewer yet): no 'print'. PDFDocViewer adds our
// own print button (ToolbarPrint) in its place, or 'print' back in Firefox.
// Also no 'pager': PDFDocViewer puts our own (ToolbarPager) first, where
// Kendo's was, because Kendo's shows the page at the top edge of the view.
export const toolsDesktop: PDFViewerTool[] = [
  'spacer',
  'zoomInOut',
  'zoom',
  'selection',
  'spacer',
  'download',
];

export const toolsMobile: PDFViewerTool[] = ['zoomInOut', 'download'];
