import type { PDFViewerTool } from '@progress/kendo-react-all';

// Kendo toolbar tools for each layout. Kept out of PDFDocViewer.tsx so that
// file exports only a component, which React's fast refresh needs.
export const toolsDesktop: PDFViewerTool[] = [
  'pager',
  'spacer',
  'zoomInOut',
  'zoom',
  'selection',
  'spacer',
  'download',
  'print',
];

export const toolsMobile: PDFViewerTool[] = ['pager', 'zoomInOut', 'download', 'print'];
