import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useViewerDocument } from './useViewerDocument';
import { useAttachments } from './useAttachments';

/**
 * Tests for the hook that holds the loaded PDF document for the attachments.
 *
 * useAttachments is mocked: it has its own suite. What is ours here is the
 * bookkeeping around it: which document it is given, and when that document
 * is forgotten.
 */

vi.mock('./useAttachments');

/** Stands in for the pdf.js document PDFDocViewer hands up. */
const fakeDocument = { getData: () => Promise.resolve(new Uint8Array([1, 2, 3])) };

/** What the mocked useAttachments returns. Only identity matters here. */
const fromUseAttachments = {
  attachments: [{ name: 'call-1', filename: 'call-1.mp3' }],
  readAttachment: vi.fn(),
} as unknown as ReturnType<typeof useAttachments>;

/** The document useAttachments was given on the latest render. */
function documentGivenToAttachments() {
  return vi.mocked(useAttachments).mock.lastCall?.[0];
}

/** Render the hook with a url; rerender({ url }) swaps it, as the caller would. */
function renderViewerDocument(url: string | undefined = '/case-001.pdf') {
  return renderHook(({ url }) => useViewerDocument(url), { initialProps: { url } });
}

describe('useViewerDocument', () => {
  beforeEach(() => {
    vi.mocked(useAttachments).mockReset();
    vi.mocked(useAttachments).mockReturnValue(fromUseAttachments);
  });

  afterEach(() => {
    cleanup();
  });

  it('starts with no document', () => {
    renderViewerDocument();

    expect(documentGivenToAttachments()).toBeNull();
  });

  it('hands the loaded document to useAttachments', () => {
    const { result } = renderViewerDocument();

    // act() lets React finish the re-render the state change causes.
    act(() => {
      result.current.onDocumentLoad(fakeDocument);
    });

    expect(documentGivenToAttachments()).toBe(fakeDocument);
  });

  it('returns what useAttachments gives back', () => {
    const { result } = renderViewerDocument();

    expect(result.current.attachments).toBe(fromUseAttachments.attachments);
    expect(result.current.readAttachment).toBe(fromUseAttachments.readAttachment);
  });

  describe('when the url changes', () => {
    it('forgets the previous document', () => {
      // Without this, the previous case's attachments, audio included, stay
      // on screen while the next case loads.
      const { result, rerender } = renderViewerDocument('/case-001.pdf');
      act(() => {
        result.current.onDocumentLoad(fakeDocument);
      });

      rerender({ url: '/case-002.pdf' });

      expect(documentGivenToAttachments()).toBeNull();
    });

    it('keeps the document when the url stays the same', () => {
      // The reset must be tied to the url, not to every render. Otherwise the
      // document would be dropped as soon as it arrived.
      const { result, rerender } = renderViewerDocument('/case-001.pdf');
      act(() => {
        result.current.onDocumentLoad(fakeDocument);
      });

      rerender({ url: '/case-001.pdf' });

      expect(documentGivenToAttachments()).toBe(fakeDocument);
    });
  });
});
