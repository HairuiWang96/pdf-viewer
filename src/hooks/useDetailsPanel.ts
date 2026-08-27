import { useState, useCallback, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Manages mobile detection and panel open/close state for both
 * the details panel (right side) and thumbnail panel (left side).
 *
 * On mobile, only one panel can be open at a time — opening one
 * automatically closes the other.
 *
 * Uses window.matchMedia to detect mobile vs desktop. matchMedia fires
 * only when the breakpoint is crossed (not on every pixel of resize),
 * making it more efficient than a resize event listener.
 */
export default function useDetailsPanel() {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isThumbnailsOpen, setIsThumbnailsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth < MOBILE_BREAKPOINT,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

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
