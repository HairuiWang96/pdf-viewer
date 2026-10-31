import type { PDFViewerTool } from '@progress/kendo-react-all';

// Kendo toolbar tools for each layout. Kept out of PDFDocViewer.tsx so that
// file exports only a component, which React's fast refresh needs.
//
// Changed (proposed, not in doc-viewer yet): no 'print'. PDFDocViewer adds our
// own print button (ToolbarPrint) in its place.
export const toolsDesktop: PDFViewerTool[] = [
  'pager',
  'spacer',
  'zoomInOut',
  'zoom',
  'selection',
  'spacer',
  'download',
];

export const toolsMobile: PDFViewerTool[] = ['pager', 'zoomInOut', 'download'];
