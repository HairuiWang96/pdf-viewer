import { describe, it, expect } from 'vitest';
import { fitWidthZoom, DESKTOP_MAX_FIT_ZOOM, MIN_ZOOM } from './fitWidthZoom';

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
        if (zoom > MIN_ZOOM) expect(page * (96 / 72) * zoom).toBeLessThanOrEqual(viewer);
      }
    }
  });

  it('refits wider when the phone is turned sideways', () => {
    expect(fitWidthZoom(844, 612)).toBeGreaterThan(fitWidthZoom(390, 612)!);
  });

  it('does not go below the minimum, so zoom-out still zooms out', () => {
    expect(fitWidthZoom(100, 612)).toBe(MIN_ZOOM);
  });

  describe('capped at 100%, as the desktop layout uses it', () => {
    it('leaves a page that already fits at 100%', () => {
      // An ordinary desktop window: a 920 px viewer holds an 816 px page.
      expect(fitWidthZoom(920, 612, DESKTOP_MAX_FIT_ZOOM)).toBe(1);
    });

    it('shrinks the page on an iPad on its side', () => {
      // Desktop layout, 714 px viewer beside the panels: was 102 px too wide.
      expect(fitWidthZoom(714, 612, DESKTOP_MAX_FIT_ZOOM)).toBe(0.87);
    });

    it('shrinks the page on an upright iPad, below Kendo’s own 0.5 floor', () => {
      // 394 px viewer: was 422 px too wide. 0.48 is why MIN_ZOOM is 0.25.
      expect(fitWidthZoom(394, 612, DESKTOP_MAX_FIT_ZOOM)).toBe(0.48);
    });
  });

  it('returns null while either size is unknown', () => {
    expect(fitWidthZoom(0, 612)).toBeNull();
    expect(fitWidthZoom(390, 0)).toBeNull();
  });
});
