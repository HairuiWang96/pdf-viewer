import { useState, useCallback, useEffect } from 'react';

/**
 * When the app uses its mobile layout. **The same query is written into six
 * CSS files** — Layout, KendoPdfViewer, PageNavigation, ToolbarAttachments,
 * BottomBarAttachments and PlacementSwitcher — and must stay identical to
 * this one, or the code will think "mobile" while the stylesheet still lays
 * out desktop, or the reverse. CSS cannot import a JS constant, so a change
 * here means changing all six.
 *
 * Two conditions, either of which is enough:
 *
 *   (max-width: 767px)
 *       Narrow screens: any phone held upright, and a narrow desktop window.
 *
 *   (max-height: 500px) and (pointer: coarse)
 *       Short *touch* screens — a phone turned sideways. An iPhone 13 on its
 *       side is 844 px wide, so width alone handed it the desktop layout, with
 *       both side panels squeezed around a 400 px viewer. But it is only 390 px
 *       tall, which desktops and tablets almost never are. `pointer: coarse`
 *       keeps a short desktop window, driven by a mouse, on the desktop layout.
 *
 * Deliberately not "detect a phone": user-agent strings are unreliable (iPads
 * report desktop Safari), and touch alone would also catch tablets and touch
 * laptops, which have room for the desktop layout. The screen's shape is what
 * decides whether the panels fit, so the shape is what this asks about.
 */
export const MOBILE_LAYOUT_QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)';

/**
 * Manages mobile detection and panel open/close state for both
 * the details panel (right side) and thumbnail panel (left side).
 *
 * On mobile, only one panel can be open at a time — opening one
 * automatically closes the other.
 *
 * Uses window.matchMedia to detect mobile vs desktop. matchMedia fires
 * only when the breakpoint is crossed (not on every pixel of resize),
 * making it more efficient than a resize event listener. The initial value
 * comes from the same query, rather than from window.innerWidth, so the two
 * cannot disagree.
 */
export default function useDetailsPanel() {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isThumbnailsOpen, setIsThumbnailsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_LAYOUT_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_LAYOUT_QUERY);

    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      // Auto-close both overlays when resizing back to desktop
      if (!e.matches) {
        setIsDetailsOpen(false);
        setIsThumbnailsOpen(false);
      }
    };

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Opening details closes thumbnails and vice versa
  const toggleDetails = useCallback(() => {
    setIsDetailsOpen((prev) => !prev);
    setIsThumbnailsOpen(false);
  }, []);

  const closeDetails = useCallback(() => {
    setIsDetailsOpen(false);
  }, []);

  const toggleThumbnails = useCallback(() => {
    setIsThumbnailsOpen((prev) => !prev);
    setIsDetailsOpen(false);
  }, []);

  const closeThumbnails = useCallback(() => {
    setIsThumbnailsOpen(false);
  }, []);

  return {
    isDetailsOpen,
    isThumbnailsOpen,
    isMobile,
    toggleDetails,
    closeDetails,
    toggleThumbnails,
    closeThumbnails,
  };
}
