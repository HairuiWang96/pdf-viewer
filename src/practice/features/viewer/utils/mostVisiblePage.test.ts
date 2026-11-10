import { describe, it, expect } from 'vitest';
import { mostVisiblePage } from './mostVisiblePage';

// Each list is how many pixels of each page show, top to bottom; the second
// argument is the page shown so far (0 = page 1).
describe('mostVisiblePage', () => {
  it('picks the page with the most pixels showing', () => {
    // Kendo would say page 1: it is the one at the top edge
    expect(mostVisiblePage([334, 442, 0, 0, 0], 0)).toBe(1);
  });

  it('keeps the page shown so far when it ties for the most', () => {
    expect(mostVisiblePage([0, 0, 191, 264, 264], 4)).toBe(4);
  });

  it('picks the first of a tie the page shown so far is not in', () => {
    expect(mostVisiblePage([0, 0, 191, 264, 264], 2)).toBe(3);
  });

  it('keeps the page shown so far when nothing shows yet', () => {
    // Before the pages have a size, or with no pages at all
    expect(mostVisiblePage([0, 0, 0], 1)).toBe(1);
    expect(mostVisiblePage([], 0)).toBe(0);
  });
});
