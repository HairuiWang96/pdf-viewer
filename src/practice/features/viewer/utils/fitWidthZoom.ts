// Practice copy of fitWidthZoom from the main viewer
// (src/components/KendoPdfViewer/fitWidthZoom.ts). See that file for the
// full reasoning; the short version is below.
//
// Changed from the original:
//   - MOBILE_DEFAULT_ZOOM is 0.5, the defaultZoom this viewer already opened
//     at on mobile, instead of 0.75
//
// The page's size has to come from Kendo's zoom, not CSS: Kendo draws each
// page onto a canvas sized for the zoom, so shrinking it with a stylesheet
// would blur it and misplace text selection.
//
//     zoom = viewer width ÷ page width at 100%
//
// A PDF page is measured in points, and Kendo draws 96/72 CSS px per point at
// 100%. So a 612 pt Letter page is 816 px wide and fits a 390 px phone at 0.47.
//
// Kept out of PDFDocViewer.tsx so that file can export only a component, which
// React's fast refresh needs.
const PDF_POINTS_TO_CSS_PX = 96 / 72;

// The zoom a mobile document opens at before it has been measured
export const MOBILE_DEFAULT_ZOOM = 0.5;

// The zoom the desktop layout opens at, and never fits above
export const DESKTOP_MAX_FIT_ZOOM = 1;

// Kendo's default minimum is 0.5, above the ~0.47 that fits a phone. Left
// there, zoom-out from a fitted page would jump *in* to 0.5, because Kendo
// computes max(current - step, min).
export const MIN_ZOOM = 0.25;

// The zoom that makes a page exactly as wide as the viewer, capped at `max`,
// or null if either size is unknown. Rounded down: rounding up by even 0.01
// leaves the page a few pixels too wide, and the sideways scroll comes back.
export function fitWidthZoom(
  viewerWidth: number,
  pageWidthPoints: number,
  max = Infinity,
): number | null {
  if (viewerWidth <= 0 || pageWidthPoints <= 0) return null;
  const zoom = Math.floor((viewerWidth / (pageWidthPoints * PDF_POINTS_TO_CSS_PX)) * 100) / 100;
  return Math.min(max, Math.max(MIN_ZOOM, zoom));
}
