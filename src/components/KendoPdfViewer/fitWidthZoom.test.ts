import { describe, it, expect } from 'vitest';
import { fitWidthZoom, MOBILE_MIN_ZOOM } from './fitWidthZoom';

/**
 * The zoom that fits a page to the viewer on mobile. Pure arithmetic, so the
 * cases are the real ones: the fixtures are US Letter (612 pt) and A4
 * (595 pt), measured on a 390 px phone in both orientations.
 */
describe('fitWidthZoom', () => {
  it('fits a Letter page to a 390 px phone', () => {
    // 612 pt is 816 px at 100%; 390 / 816 = 0.478 → 0.47.
    expect(fitWidthZoom(390, 612)).toBe(0.47);
  });

  it('fits an A4 page to a 390 px phone', () => {
    // 595 pt is 793.3 px at 100%; 390 / 793.3 = 0.4916 → 0.49.
    expect(fitWidthZoom(390, 595)).toBe(0.49);
  });

  it('never makes the page wider than the viewer', () => {
    // Rounding up by 0.01 would bring back a few pixels of sideways scroll,
    // so the fitted page must always come out at or under the viewer width.
    for (const viewer of [320, 360, 375, 390, 414, 430, 768, 844]) {
      for (const page of [595, 612, 792, 842]) {
        const zoom = fitWidthZoom(viewer, page)!;
        if (zoom > MOBILE_MIN_ZOOM) expect(page * (96 / 72) * zoom).toBeLessThanOrEqual(viewer);
      }
    }
  });

  it('refits wider when the phone is turned sideways', () => {
    expect(fitWidthZoom(844, 612)).toBeGreaterThan(fitWidthZoom(390, 612)!);
  });

  it('does not go below the minimum, so zoom-out still zooms out', () => {
    expect(fitWidthZoom(100, 612)).toBe(MOBILE_MIN_ZOOM);
  });

  it('returns null while either size is unknown', () => {
    expect(fitWidthZoom(0, 612)).toBeNull();
    expect(fitWidthZoom(390, 0)).toBeNull();
  });
});
