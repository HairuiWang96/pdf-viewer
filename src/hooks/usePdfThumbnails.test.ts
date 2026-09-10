import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import usePdfThumbnails from './usePdfThumbnails';

/**
 * Tests for the hook that renders each page to a PNG for the thumbnail rail.
 *
 * PDF.js is mocked: jsdom has no canvas rendering, so driving the real thing
 * would test the browser rather than this hook. What matters here is the
 * bookkeeping around it — that thumbnails are tied to the document they came
 * from, that a swapped file does not briefly show the previous document's
 * pages, and that an in-flight render is cancelled on unmount.
 */

const { pdfjsMock } = vi.hoisted(() => ({
  pdfjsMock: {
    numPages: 2,
    destroy: vi.fn(),
    cleanup: vi.fn(),
    renderShouldFail: false,
  },
}));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: vi.fn(() => ({
    destroy: pdfjsMock.destroy,
    promise: Promise.resolve({
      numPages: pdfjsMock.numPages,
      getPage: vi.fn(async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 140 * scale }),
        render: () => ({
          promise: pdfjsMock.renderShouldFail
            ? Promise.reject(new Error('render failed'))
            : Promise.resolve(),
        }),
        cleanup: pdfjsMock.cleanup,
      })),
    }),
  })),
}));

// Side-effect import in the hook; nothing to stand in for.
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs', () => ({}));

describe('usePdfThumbnails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfjsMock.numPages = 2;
    pdfjsMock.renderShouldFail = false;
    // jsdom canvases have no 2D context, so toDataURL is stubbed.
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,MOCK');
  });

  it('starts empty while the first render is still in flight', () => {
    const { result } = renderHook(() => usePdfThumbnails('/case.pdf', 140));

    expect(result.current).toEqual([]);
  });

  it('returns one thumbnail per page once rendering finishes', async () => {
    const { result } = renderHook(() => usePdfThumbnails('/case.pdf', 140));

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current[0]).toBe('data:image/png;base64,MOCK');
  });

  it('frees each page after rendering it', async () => {
    const { result } = renderHook(() => usePdfThumbnails('/case.pdf', 140));

    await waitFor(() => expect(result.current).toHaveLength(2));
    // Without cleanup(), PDF.js holds every rendered page in memory.
    expect(pdfjsMock.cleanup).toHaveBeenCalledTimes(2);
  });

  it('shows nothing rather than the previous document when the file changes', async () => {
    const { result, rerender } = renderHook(({ path }) => usePdfThumbnails(path, 140), {
      initialProps: { path: '/first.pdf' },
    });

    await waitFor(() => expect(result.current).toHaveLength(2));

    rerender({ path: '/second.pdf' });

    // The stale thumbnails belong to /first.pdf, so they must not be shown
    // under the new document even for a frame.
    expect(result.current).toEqual([]);
  });

  it('tears down the loading task on unmount', async () => {
    const { result, unmount } = renderHook(() => usePdfThumbnails('/case.pdf', 140));
    await waitFor(() => expect(result.current).toHaveLength(2));

    unmount();

    expect(pdfjsMock.destroy).toHaveBeenCalled();
  });

  it('stays empty instead of throwing when a page fails to render', async () => {
    pdfjsMock.renderShouldFail = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => usePdfThumbnails('/broken.pdf', 140));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(result.current).toEqual([]);

    errorSpy.mockRestore();
  });
});
