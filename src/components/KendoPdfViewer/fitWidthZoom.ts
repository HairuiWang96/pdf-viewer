/**
 * ── Fit to width on mobile ──
 *
 * A page's on-screen size is Kendo's zoom level, not CSS: Kendo draws each
 * page onto a canvas sized for the zoom, so shrinking it with a stylesheet
 * would blur it and put selection and search in the wrong place. The fixed
 * 75% the viewer used to open at left a Letter page 612 px wide on a 390 px
 * phone — 222 px of sideways scrolling before reading a word.
 *
 * So on mobile the zoom is chosen to fit the page to the viewer's width, with
 * the same formula as Kendo's own "Fit to width" (hidden on mobile, where the
 * toolbar has no zoom drop-down):
 *
 *     zoom = viewer width ÷ page width at 100%
 *
 * A PDF page is measured in points; Kendo draws it at 96/72 CSS px per point
 * at 100%, so a 612 pt Letter page is 816 px wide and fits a 390 px viewer at
 * 0.47.
 *
 * Kept out of KendoPdfViewer.tsx so that file exports only a component, which
 * React's fast refresh needs.
 */
const PDF_POINTS_TO_CSS_PX = 96 / 72;

/** The zoom a mobile document opens at before it has been measured. */
export const MOBILE_DEFAULT_ZOOM = 0.75;

/**
 * Kendo's default floor is 0.5, above the ~0.47 that fits a phone. Left there,
 * a fitted page would sit below the minimum and the zoom-out button would
 * jump *in* to 0.5 — Kendo computes max(current - step, min).
 */
export const MOBILE_MIN_ZOOM = 0.25;

/**
 * The zoom that makes a page exactly as wide as the viewer, or null if either
 * size is unknown. Rounded down, not to nearest: rounding up by even 0.01
 * leaves the page a few pixels too wide, and the sideways scroll comes back.
 */
export function fitWidthZoom(viewerWidth: number, pageWidthPoints: number): number | null {
  if (viewerWidth <= 0 || pageWidthPoints <= 0) return null;
  const zoom = Math.floor((viewerWidth / (pageWidthPoints * PDF_POINTS_TO_CSS_PX)) * 100) / 100;
  return Math.max(MOBILE_MIN_ZOOM, zoom);
}
