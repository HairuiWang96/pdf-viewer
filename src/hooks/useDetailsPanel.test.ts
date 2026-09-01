import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useDetailsPanel from './useDetailsPanel';

/**
 * Tests for the hook that tracks the mobile breakpoint and the details panel.
 *
 * The interesting part is `window.matchMedia`. jsdom does not implement it, and
 * the stub in src/test/setup.ts is deliberately inert — it always reports
 * "not mobile" and ignores listeners. That is fine for other suites, but here
 * we need to *drive* it, so this file installs a controllable version.
 */

/** Listeners the hook registered, so a test can fire them on demand. */
let changeHandlers: Array<(e: MediaQueryListEvent) => void> = [];
let removeCalls = 0;

/**
 * A hand-built stand-in for window.matchMedia.
 *
 * Real matchMedia returns a MediaQueryList that fires 'change' only when the
 * viewport crosses the breakpoint. We reproduce just enough of that: record the
 * handler, and let tests invoke it with a chosen `matches` value.
 */
function installMatchMedia(initialMatches: boolean) {
  changeHandlers = [];
  removeCalls = 0;

  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: initialMatches,
    media: query,
    onchange: null,
    addEventListener: (_event: string, handler: (e: MediaQueryListEvent) => void) => {
      changeHandlers.push(handler);
    },
    removeEventListener: () => {
      removeCalls += 1;
    },
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
}

/** Pretend the viewport just crossed the breakpoint. */
function crossBreakpoint(matches: boolean) {
  act(() => {
    changeHandlers.forEach((handler) => handler({ matches } as MediaQueryListEvent));
  });
}

/** The hook reads window.innerWidth once, for its initial value. */
function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
}

const originalWidth = window.innerWidth;

describe('useDetailsPanel', () => {
  beforeEach(() => {
    installMatchMedia(false);
    setViewportWidth(1024); // desktop by default
  });

  afterEach(() => {
    setViewportWidth(originalWidth);
  });

  it('starts with the panel closed', () => {
    const { result } = renderHook(() => useDetailsPanel());

    expect(result.current.isDetailsOpen).toBe(false);
  });

  it('reports desktop when the window is at or above the breakpoint', () => {
    setViewportWidth(1024);

    const { result } = renderHook(() => useDetailsPanel());

    expect(result.current.isMobile).toBe(false);
  });

  it('reports mobile when the window is below the breakpoint', () => {
    // 768 is the breakpoint, so 767 is the widest mobile viewport.
    setViewportWidth(767);

    const { result } = renderHook(() => useDetailsPanel());

    expect(result.current.isMobile).toBe(true);
  });

  it('opens and closes the panel with toggleDetails', () => {
    const { result } = renderHook(() => useDetailsPanel());

    act(() => result.current.toggleDetails());
    expect(result.current.isDetailsOpen).toBe(true);

    act(() => result.current.toggleDetails());
    expect(result.current.isDetailsOpen).toBe(false);
  });

  it('closeDetails always closes, even when already closed', () => {
    const { result } = renderHook(() => useDetailsPanel());

    act(() => result.current.closeDetails());
    expect(result.current.isDetailsOpen).toBe(false);

    act(() => result.current.toggleDetails());
    act(() => result.current.closeDetails());
    expect(result.current.isDetailsOpen).toBe(false);
  });

  it('switches to mobile when the viewport crosses the breakpoint', () => {
    const { result } = renderHook(() => useDetailsPanel());
    expect(result.current.isMobile).toBe(false);

    crossBreakpoint(true);

    expect(result.current.isMobile).toBe(true);
  });

  it('auto-closes the open panel when returning to desktop', () => {
    setViewportWidth(767);
    const { result } = renderHook(() => useDetailsPanel());

    act(() => result.current.toggleDetails());
    expect(result.current.isDetailsOpen).toBe(true);

    // Back to desktop: the panel is a mobile overlay, so leaving it open
    // would strand it on a layout that has no way to close it.
    crossBreakpoint(false);

    expect(result.current.isMobile).toBe(false);
    expect(result.current.isDetailsOpen).toBe(false);
  });

  it('removes its listener on unmount', () => {
    const { unmount } = renderHook(() => useDetailsPanel());

    unmount();

    // Without this cleanup, every mount would leak a listener.
    expect(removeCalls).toBe(1);
  });
});
