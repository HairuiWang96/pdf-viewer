import { useState, useCallback, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

export default function useDetailsPanel() {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth < MOBILE_BREAKPOINT,
  );

  // window.matchMedia() creates a MediaQueryList object that watches a CSS
  // media query in JavaScript. It only fires its 'change' event when the
  // viewport crosses the breakpoint — not on every pixel of resize.
  //
  // Why matchMedia instead of a resize event listener?
  // - resize fires hundreds of times per second during a window drag
  // - matchMedia fires only once when crossing the threshold (e.g. 768px)
  // - It's the JS equivalent of a CSS @media rule, so it's more efficient
  useEffect(() => {
    // mql = MediaQueryList. Watches "(max-width: 767px)" — true when mobile.
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    // This handler is called only when the viewport crosses the breakpoint.
    // e.matches = true  → just entered mobile range
    // e.matches = false → just left mobile range (back to desktop/tablet)
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      // Auto-close the panel when switching back to desktop
      if (!e.matches) setIsDetailsOpen(false);
    };

    mql.addEventListener('change', handler);
    // Cleanup: remove listener when component unmounts
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

// ─── Why we need both CSS media queries and JS matchMedia ───
//
// They handle different concerns:
//
// CSS media queries control how things LOOK:
//   - Shrink sidebar width on tablet (300px → 260px)
//   - Position the panel as a fixed overlay on mobile
//   - Adjust padding, font sizes at different screen widths
//
// JS matchMedia controls how things BEHAVE:
//   - Should the toggle button exist in the DOM? (isMobile)
//   - Is the panel currently open or closed? (isDetailsOpen)
//   - Should the backdrop element render?
//   - Should we auto-close the panel when resizing back to desktop?
//
// The key difference: CSS can hide a sidebar visually, but it can't
// manage interactive state. When the user taps the hamburger button,
// that's a state change — React needs to know about it to render the
// backdrop, toggle the button icon, and close the panel on backdrop tap.
//
// You can't conditionally render a React component with pure CSS.
// display: none hides it visually, but the component is still in the
// DOM, still running its effects, still receiving props.
//
// In practice, users are either on mobile or desktop — they rarely
// resize across breakpoints. But we still need both:
//   CSS  → layout, positioning, transitions, breakpoint-specific sizing
//   JS   → toggle state, conditional rendering, user interactions
//
// The resize handling (auto-close on crossing back to desktop) is a
// safety net — nice to have, not the main reason we use matchMedia.
