import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Unmount anything rendered by the previous test so state never leaks
// between tests.
afterEach(() => {
  cleanup();
});

// jsdom does not implement these, and our components call them:
//
// - matchMedia:      useDetailsPanel watches the mobile breakpoint with it
// - scrollIntoView:  CustomDropdown scrolls the arrow-key focused option
//                    into view
// - requestAnimationFrame is implemented by jsdom, so it is left alone.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
}

Element.prototype.scrollIntoView = vi.fn();
