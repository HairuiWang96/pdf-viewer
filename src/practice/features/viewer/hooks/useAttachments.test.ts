import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { PDF } from '@libpdf/core';
import { useAttachments } from './useAttachments';
import type { PDFBytesSource } from './useAttachments';
import { findRichMediaAudio } from '../utils/richMediaAudio';

/**
 * Tests for the hook that lists a PDF's embedded audio and reads it on demand.
 *
 * libpdf and the RichMedia scan are mocked: parsing real PDFs is theirs to
 * test. What is ours is the bookkeeping: what gets listed, that listing reads
 * no file, that each attachment reads its own bytes, and that nothing from a
 * previous document survives a switch.
 */

vi.mock('@libpdf/core', () => ({ PDF: { load: vi.fn() } }));
vi.mock('../utils/richMediaAudio', () => ({ findRichMediaAudio: vi.fn() }));

/** A parsed PDF with the given files attached directly. */
function fakePdf(files: Record<string, Uint8Array>) {
  const infos = new Map(Object.keys(files).map((name) => [name, { name, filename: `${name}.mp3` }]));
  return {
    getAttachments: () => infos,
    getAttachment: vi.fn((name: string) => files[name] ?? null),
  };
}

/** What Kendo hands up: something that can produce the PDF's bytes. */
function fakeDocument(): PDFBytesSource {
  return { getData: () => Promise.resolve(new Uint8Array([0])) };
}

/** Make PDF.load parse to the given fake, whatever bytes it is given. */
function loadsAs(pdf: ReturnType<typeof fakePdf>) {
  vi.mocked(PDF.load).mockResolvedValue(pdf as unknown as PDF);
}

/** Render the hook with a document that tests can change through rerender. */
function renderAttachments(document: PDFBytesSource | null) {
  return renderHook(({ doc }) => useAttachments(doc), { initialProps: { doc: document } });
}

describe('useAttachments', () => {
  beforeEach(() => {
    vi.mocked(PDF.load).mockReset();
    vi.mocked(findRichMediaAudio).mockReset();
    vi.mocked(findRichMediaAudio).mockReturnValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('lists nothing, and parses nothing, without a document', () => {
    const { result } = renderAttachments(null);

    expect(result.current.attachments).toEqual([]);
    expect(PDF.load).not.toHaveBeenCalled();
  });

  describe('listing', () => {
    it('lists the files attached directly to the PDF', async () => {
      loadsAs(fakePdf({ 'call-1': new Uint8Array([1]), 'call-2': new Uint8Array([2]) }));

      const { result } = renderAttachments(fakeDocument());

      // Parsing is asynchronous, so wait for the list to arrive.
      await waitFor(() => expect(result.current.attachments.map((a) => a.name)).toEqual(['call-1', 'call-2']));
    });

    it('lists audio from RichMedia annotations after the direct attachments', async () => {
      loadsAs(fakePdf({ 'call-1': new Uint8Array([1]) }));
      vi.mocked(findRichMediaAudio).mockReturnValue([
        { name: 'rich-1', filename: 'interview.mp3', mimeType: 'audio/mpeg', read: () => new Uint8Array([9]) },
      ]);

      const { result } = renderAttachments(fakeDocument());

      await waitFor(() => expect(result.current.attachments).toHaveLength(2));
      expect(result.current.attachments[1]).toEqual({
        name: 'rich-1',
        filename: 'interview.mp3',
        mimeType: 'audio/mpeg',
      });
    });

    it('lists without reading any file', async () => {
      // Attachments can be hundreds of MB. Showing that they exist must not
      // pull any of them into memory; only playing one should.
      const pdf = fakePdf({ 'call-1': new Uint8Array([1]) });
      const readRichMedia = vi.fn(() => new Uint8Array([9]));
      loadsAs(pdf);
      vi.mocked(findRichMediaAudio).mockReturnValue([{ name: 'rich-1', filename: 'interview.mp3', read: readRichMedia }]);

      const { result } = renderAttachments(fakeDocument());

      await waitFor(() => expect(result.current.attachments).toHaveLength(2));
      expect(pdf.getAttachment).not.toHaveBeenCalled();
      expect(readRichMedia).not.toHaveBeenCalled();
    });

    it('logs and lists nothing when the PDF cannot be read', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(PDF.load).mockRejectedValue(new Error('not a PDF'));

      const { result } = renderAttachments(fakeDocument());

      await waitFor(() => expect(consoleError).toHaveBeenCalled());
      expect(result.current.attachments).toEqual([]);

      consoleError.mockRestore();
    });
  });

  describe('reading', () => {
    it("reads each attachment's own bytes", async () => {
      // If every reader pointed at the same file, every player would play the
      // first recording, and the list would still look right.
      loadsAs(fakePdf({ 'call-1': new Uint8Array([1]), 'call-2': new Uint8Array([2]) }));
      vi.mocked(findRichMediaAudio).mockReturnValue([
        { name: 'rich-1', filename: 'interview.mp3', read: () => new Uint8Array([9]) },
      ]);

      const { result } = renderAttachments(fakeDocument());
      await waitFor(() => expect(result.current.attachments).toHaveLength(3));

      const [first, second, rich] = result.current.attachments;
      expect(result.current.readAttachment(first)).toEqual(new Uint8Array([1]));
      expect(result.current.readAttachment(second)).toEqual(new Uint8Array([2]));
      expect(result.current.readAttachment(rich)).toEqual(new Uint8Array([9]));
    });

    it('returns null for an attachment it does not know', async () => {
      loadsAs(fakePdf({ 'call-1': new Uint8Array([1]) }));

      const { result } = renderAttachments(fakeDocument());
      await waitFor(() => expect(result.current.attachments).toHaveLength(1));

      expect(result.current.readAttachment({ name: 'not-there', filename: 'x.mp3' })).toBeNull();
    });
  });

  describe('when the document changes', () => {
    it("replaces the list with the new document's", async () => {
      vi.mocked(PDF.load)
        .mockResolvedValueOnce(fakePdf({ 'case-1-call': new Uint8Array([1]) }) as unknown as PDF)
        .mockResolvedValueOnce(fakePdf({ 'case-2-call': new Uint8Array([2]) }) as unknown as PDF);

      const { result, rerender } = renderAttachments(fakeDocument());
      await waitFor(() => expect(result.current.attachments.map((a) => a.name)).toEqual(['case-1-call']));

      rerender({ doc: fakeDocument() });

      await waitFor(() => expect(result.current.attachments.map((a) => a.name)).toEqual(['case-2-call']));
    });

    it('clears the list, and stops reading, when the document goes away', async () => {
      loadsAs(fakePdf({ 'call-1': new Uint8Array([1]) }));

      const { result, rerender } = renderAttachments(fakeDocument());
      await waitFor(() => expect(result.current.attachments).toHaveLength(1));
      const oldAttachment = result.current.attachments[0];

      rerender({ doc: null });

      expect(result.current.attachments).toEqual([]);
      // A player still holding the old attachment gets nothing, rather than
      // the previous case's recording.
      expect(result.current.readAttachment(oldAttachment)).toBeNull();
    });

    it('ignores a slow load that finishes after the document changed', async () => {
      // Switch cases quickly and the first case's PDF can finish parsing
      // after the second's. Its list must not overwrite the current one.
      let finishFirst: (bytes: Uint8Array) => void = () => {};
      const slowDocument: PDFBytesSource = {
        getData: () => new Promise<Uint8Array>((resolve) => (finishFirst = resolve)),
      };
      vi.mocked(PDF.load).mockImplementation(async (bytes) =>
        (bytes[0] === 1
          ? fakePdf({ 'case-1-call': new Uint8Array([1]) })
          : fakePdf({ 'case-2-call': new Uint8Array([2]) })) as unknown as PDF,
      );

      const { result, rerender } = renderAttachments(slowDocument);
      rerender({ doc: fakeDocument() });
      await waitFor(() => expect(result.current.attachments.map((a) => a.name)).toEqual(['case-2-call']));

      // Finish the first load, and let React apply anything it sets, before
      // checking it changed nothing. Without act() the late update could
      // still be queued when the check runs, and the test would pass anyway.
      await act(async () => {
        finishFirst(new Uint8Array([1]));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.attachments.map((a) => a.name)).toEqual(['case-2-call']);
    });
  });
});
