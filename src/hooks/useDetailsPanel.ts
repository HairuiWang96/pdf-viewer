import { useState, useCallback, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Manages mobile detection and the details panel open/close state.
 *
 * Uses window.matchMedia to detect mobile vs desktop. matchMedia fires
 * only when the breakpoint is crossed (not on every pixel of resize),
 * making it more efficient than a resize event listener.
 *
 * CSS media queries handle the visual layout (sidebar width, overlay style),
 * while this hook handles interactive state (should the toggle button render?
 * should the panel be open or closed?).
 */
export default function useDetailsPanel() {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth < MOBILE_BREAKPOINT,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      // Auto-close the overlay when resizing back to desktop
      if (!e.matches) setIsDetailsOpen(false);
    };

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const toggleDetails = useCallback(() => {
    setIsDetailsOpen((prev) => !prev);
  }, []);

  const closeDetails = useCallback(() => {
    setIsDetailsOpen(false);
  }, []);

  return { isDetailsOpen, isMobile, toggleDetails, closeDetails };
}
