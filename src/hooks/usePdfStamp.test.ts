import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import usePdfStamp from './usePdfStamp';

/**
 * Tests for the hook that stamps the PDF client-side.
 *
 * pdf-lib is mocked out: it does real cryptographic-grade PDF surgery and
 * would need a genuine file, while everything worth testing here is the
 * toggle's state machine — what the default is, when it resets, and which
 * URL callers are handed.
 */

const { pdfMock } = vi.hoisted(() => ({
  pdfMock: {
    save: vi.fn(async () => new Uint8Array([1, 2, 3])),
    drawText: vi.fn(),
  },
}));

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn(async () => ({
      embedFont: vi.fn(async () => ({ widthOfTextAtSize: () => 40 })),
      getPages: () => [
        {
          getSize: () => ({ width: 595, height: 842 }),
          getHeight: () => 842,
          drawText: pdfMock.drawText,
        },
      ],
      save: pdfMock.save,
    })),
  },
  StandardFonts: { HelveticaBold: 'Helvetica-Bold' },
  rgb: (r: number, g: number, b: number) => ({ r, g, b }),
}));

describe('usePdfStamp', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
    );

    let counter = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:stamped-${counter++}`),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to off, so a freshly picked case is unstamped', () => {
    const { result } = renderHook(() => usePdfStamp('/case.pdf', 'INTERNAL', { defaultOn: false }));

    expect(result.current.showStamp).toBe(false);
    // Nothing to stamp yet, so callers get the original file.
    expect(result.current.activePdfPath).toBe('/case.pdf');
  });

  it('defaults to on when there is only one case to look at', () => {
    const { result } = renderHook(() => usePdfStamp('/case.pdf', 'INTERNAL', { defaultOn: true }));

    expect(result.current.showStamp).toBe(true);
  });

  it('serves the stamped file once stamping finishes', async () => {
    const { result } = renderHook(() => usePdfStamp('/case.pdf', 'INTERNAL', { defaultOn: true }));

    await waitFor(() => {
      expect(result.current.activePdfPath).toBe('blob:stamped-0');
    });
    expect(pdfMock.drawText).toHaveBeenCalledWith('INTERNAL', expect.any(Object));
  });

  it('goes back to the original file when the stamp is switched off', async () => {
    const { result } = renderHook(() => usePdfStamp('/case.pdf', 'INTERNAL', { defaultOn: true }));
    await waitFor(() => expect(result.current.activePdfPath).toBe('blob:stamped-0'));

    act(() => result.current.toggleStamp(false));

    expect(result.current.showStamp).toBe(false);
    expect(result.current.activePdfPath).toBe('/case.pdf');
  });

  it('remembers the choice while the same case stays selected', () => {
    const { result, rerender } = renderHook(
      ({ key }) => usePdfStamp('/case.pdf', 'INTERNAL', { defaultOn: false, resetKey: key }),
      { initialProps: { key: 1 } },
    );

    act(() => result.current.toggleStamp(true));
    expect(result.current.showStamp).toBe(true);

    // A re-render that is not a new selection must not discard the choice.
    rerender({ key: 1 });
    expect(result.current.showStamp).toBe(true);
  });

  it('resets to the default when a different case is picked', () => {
    const { result, rerender } = renderHook(
      ({ key }) => usePdfStamp('/case.pdf', 'INTERNAL', { defaultOn: false, resetKey: key }),
      { initialProps: { key: 1 } },
    );

    act(() => result.current.toggleStamp(true));
    expect(result.current.showStamp).toBe(true);

    // Bumping resetKey is how the page signals "the user picked a case" —
    // the new case should start from the default, not inherit the last one.
    rerender({ key: 2 });
    expect(result.current.showStamp).toBe(false);
  });

  it('does not stamp at all while the toggle is off', () => {
    renderHook(() => usePdfStamp('/case.pdf', 'INTERNAL', { defaultOn: false }));

    // No fetch, no pdf-lib work — stamping is not free, so it should only
    // happen when someone actually asked for it.
    expect(fetch).not.toHaveBeenCalled();
  });

  /**
   * A stamped PDF is a whole document held in memory, so failing to revoke one
   * is the most expensive leak in the app — and completely invisible: the
   * viewer keeps working, nothing logs, memory just climbs.
   */
  describe('blob URL lifecycle', () => {
    it('releases the stamped file when the document changes', async () => {
      const { result, rerender } = renderHook(
        ({ path }) => usePdfStamp(path, 'INTERNAL', { defaultOn: true }),
        { initialProps: { path: '/first.pdf' } },
      );
      await waitFor(() => expect(result.current.activePdfPath).toBe('blob:stamped-0'));

      rerender({ path: '/second.pdf' });

      await waitFor(() => {
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stamped-0');
      });
      // And the new document gets stamped in its place.
      await waitFor(() => expect(result.current.activePdfPath).toBe('blob:stamped-1'));
    });

    it('releases the stamped file when the stamp is switched off', async () => {
      const { result } = renderHook(() =>
        usePdfStamp('/case.pdf', 'INTERNAL', { defaultOn: true }),
      );
      await waitFor(() => expect(result.current.activePdfPath).toBe('blob:stamped-0'));

      act(() => result.current.toggleStamp(false));

      await waitFor(() => {
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stamped-0');
      });
    });

    it('releases the stamped file on unmount', async () => {
      const { result, unmount } = renderHook(() =>
        usePdfStamp('/case.pdf', 'INTERNAL', { defaultOn: true }),
      );
      await waitFor(() => expect(result.current.activePdfPath).toBe('blob:stamped-0'));

      unmount();

      await waitFor(() => {
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stamped-0');
      });
    });
  });

  it('leaves the original file in place when stamping fails', async () => {
    // A file that cannot be fetched or parsed should not take the page down
    // with an unhandled rejection — the viewer just shows it unstamped.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const { result } = renderHook(() => usePdfStamp('/case.pdf', 'INTERNAL', { defaultOn: true }));

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(result.current.activePdfPath).toBe('/case.pdf');

    consoleError.mockRestore();
  });
});
