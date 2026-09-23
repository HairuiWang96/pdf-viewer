import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import usePdfThumbnails from './usePdfThumbnails';

/**
 * Tests for the hook that renders each page to a PNG for the thumbnail rail.
 *
 * The hook draws from the viewer's own PDF.js document rather than loading
 * the file, so a fake document stands in for Kendo's. jsdom has no canvas
 * rendering, so driving real PDF.js would test the browser rather than this
 * hook. What matters is the bookkeeping: thumbnails are tied to the document
 * they came from, a new document never shows the previous one's pages, and —
 * because the document is Kendo's — this hook never frees or destroys it.
 */

interface FakeDocument {
  numPages: number;
  getPage: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  cleanup: ReturnType<typeof vi.fn>;
  pageCleanup: ReturnType<typeof vi.fn>;
}

function fakeDocument({ numPages = 2, renderFails = false } = {}) {
  const pageCleanup = vi.fn();
  const doc: FakeDocument = {
    numPages,
    getPage: vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 140 * scale }),
      render: () => ({
        promise: renderFails ? Promise.reject(new Error('render failed')) : Promise.resolve(),
      }),
      cleanup: pageCleanup,
    })),
    destroy: vi.fn(),
    cleanup: vi.fn(),
    pageCleanup,
  };
  return doc;
}

const asProxy = (doc: FakeDocument) => doc as unknown as PDFDocumentProxy;

describe('usePdfThumbnails', () => {
  beforeEach(() => {
    // jsdom canvases have no 2D context, so toDataURL is stubbed.
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,MOCK');
  });

  it('shows nothing until the viewer has a document', () => {
    const { result } = renderHook(() => usePdfThumbnails(null, 140));

    expect(result.current).toEqual([]);
  });

  it('starts empty while the first render is still in flight', () => {
    const doc = asProxy(fakeDocument());
    const { result } = renderHook(() => usePdfThumbnails(doc, 140));

    expect(result.current).toEqual([]);
  });

  it('returns one thumbnail per page once rendering finishes', async () => {
    const doc = asProxy(fakeDocument());
    const { result } = renderHook(() => usePdfThumbnails(doc, 140));

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current[0]).toBe('data:image/png;base64,MOCK');
  });

  it('never frees or destroys the document, because it is the viewer’s', async () => {
    const fake = fakeDocument();
    const doc = asProxy(fake);
    const { result, unmount } = renderHook(() => usePdfThumbnails(doc, 140));
    await waitFor(() => expect(result.current).toHaveLength(2));

    unmount();

    // Kendo is drawing the same pages. page.cleanup() would free what it is
    // using, and destroy() would close its document under it.
    expect(fake.pageCleanup).not.toHaveBeenCalled();
    expect(fake.cleanup).not.toHaveBeenCalled();
    expect(fake.destroy).not.toHaveBeenCalled();
  });

  it('shows nothing rather than the previous document when the document changes', async () => {
    const first = asProxy(fakeDocument());
    const second = asProxy(fakeDocument());
    const { result, rerender } = renderHook(({ doc }) => usePdfThumbnails(doc, 140), {
      initialProps: { doc: first },
    });

    await waitFor(() => expect(result.current).toHaveLength(2));

    rerender({ doc: second });

    // The stale thumbnails belong to the first document, so they must not be
    // shown under the new one even for a frame.
    expect(result.current).toEqual([]);
  });

  it('shows nothing once the viewer drops its document', async () => {
    const doc = asProxy(fakeDocument());
    const { result, rerender } = renderHook(
      ({ current }: { current: PDFDocumentProxy | null }) => usePdfThumbnails(current, 140),
      { initialProps: { current: doc as PDFDocumentProxy | null } },
    );
    await waitFor(() => expect(result.current).toHaveLength(2));

    // The page nulls the document as soon as the case changes.
    rerender({ current: null });

    expect(result.current).toEqual([]);
  });

  it('stays empty instead of throwing when a page fails to render', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const doc = asProxy(fakeDocument({ renderFails: true }));

    const { result } = renderHook(() => usePdfThumbnails(doc, 140));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(result.current).toEqual([]);

    errorSpy.mockRestore();
  });

  it('stays quiet when a render fails after the document was replaced', async () => {
    // When the case changes, Kendo destroys the old document and a render
    // still running here fails. That is expected, not worth an error.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = asProxy(fakeDocument({ renderFails: true }));
    const { rerender } = renderHook(({ doc }) => usePdfThumbnails(doc, 140), {
      initialProps: { doc: failing as PDFDocumentProxy | null },
    });

    rerender({ doc: null });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
