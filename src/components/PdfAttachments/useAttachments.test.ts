import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { PDFDocument, PDFHexString, PDFName, PDFString, type PDFContext } from 'pdf-lib';
import { useAttachments } from './useAttachments';
import { guessAudioMimeType, formatSize } from './attachments';

/**
 * Listing what a document carries, without reading any of it.
 *
 * The hook fetches and parses the file itself rather than taking a pdf.js
 * document, so these tests stub fetch with real PDF bytes. The three placement
 * components take the finished list and have their own suites; nothing here
 * renders anything.
 */

/** A one-page PDF with the given files in the catalog's attachment tree. */
async function pdfWithAttachments(files: { name: string; bytes: Uint8Array }[]) {
  const document = await PDFDocument.create();
  document.addPage();
  const context: PDFContext = document.context;

  const names = files.flatMap((file) => [
    PDFHexString.fromText(file.name),
    context.register(
      context.obj({
        Type: 'Filespec',
        F: PDFString.of(file.name),
        UF: PDFHexString.fromText(file.name),
        EF: context.obj({ F: context.register(context.stream(file.bytes)) }),
      }),
    ),
  ]);

  document.catalog.set(
    PDFName.of('Names'),
    context.obj({ EmbeddedFiles: context.obj({ Names: context.obj(names) }) }),
  );
  return document.save();
}

/** Serves each path its own bytes, and counts the requests. */
function stubFetch(files: Record<string, Uint8Array>) {
  const fetched: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      fetched.push(input);
      const bytes = files[input];
      if (!bytes) return Promise.reject(new Error(`no such file: ${input}`));
      // A fresh copy per call, so a consumed buffer cannot affect the next.
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(bytes.slice().buffer) });
    }),
  );

  return fetched;
}

const AUDIO = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x05, 0x06]);
const OTHER = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

describe('guessAudioMimeType', () => {
  it.each([
    ['note.wav', 'audio/wav'],
    ['note.mp3', 'audio/mpeg'],
    ['note.m4a', 'audio/mp4'],
    ['note.ogg', 'audio/ogg'],
    ['note.aac', 'audio/aac'],
  ])('maps %s to %s', (filename, expected) => {
    expect(guessAudioMimeType(filename)).toBe(expected);
  });

  it('ignores case, since extensions are not consistently lowercase', () => {
    expect(guessAudioMimeType('RECORDING.MP3')).toBe('audio/mpeg');
  });

  it('uses the last extension when a name contains several dots', () => {
    expect(guessAudioMimeType('interview.part1.final.wav')).toBe('audio/wav');
  });

  it('returns null for a non-audio file, which is what makes it a download', () => {
    expect(guessAudioMimeType('transcript.pdf')).toBeNull();
  });

  it('returns null when there is no extension at all', () => {
    expect(guessAudioMimeType('README')).toBeNull();
  });
});

describe('formatSize', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [8_257_667, '7.9 MB'],
    [15_000_000, '14 MB'],
    [3_221_225_472, '3.0 GB'],
  ])('renders %i as %s', (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });

  it('says nothing when the document declared no size', () => {
    expect(formatSize(null)).toBeNull();
  });
});

describe('useAttachments', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns nothing before there is a file to read', () => {
    const { result } = renderHook(() => useAttachments(undefined));

    expect(result.current).toEqual([]);
  });

  /**
   * Three things on the page load the same PDF, and the browser stops
   * collapsing that to one transfer once the file is too large to cache — on
   * the deployed build a 29.7 MB case file was fetched three times. Borrowing
   * the bytes the viewer already downloaded is how this hook stops being one
   * of the three.
   */
  describe('reusing the viewer’s bytes', () => {
    it('does not fetch when the viewer can supply the document', async () => {
      const fetched = stubFetch({});
      const bytes = await pdfWithAttachments([{ name: 'note.mp3', bytes: AUDIO }]);
      const source = { getData: vi.fn(() => Promise.resolve(bytes)) };

      const { result } = renderHook(() => useAttachments('/case.pdf', source));

      await waitFor(() => expect(result.current).toHaveLength(1));
      expect(source.getData).toHaveBeenCalled();
      // The stub would reject '/case.pdf' anyway; the point is nothing asked.
      expect(fetched).toEqual([]);
    });

    it('reads an attachment without fetching either', async () => {
      const fetched = stubFetch({});
      const bytes = await pdfWithAttachments([{ name: 'note.mp3', bytes: AUDIO }]);
      const source = { getData: () => Promise.resolve(bytes) };

      const { result } = renderHook(() => useAttachments('/case.pdf', source));
      await waitFor(() => expect(result.current).toHaveLength(1));

      expect(await result.current[0].read()).toEqual(AUDIO);
      expect(fetched).toEqual([]);
    });

    it('falls back to fetching when there is no viewer to borrow from', async () => {
      const fetched = stubFetch({
        '/case.pdf': await pdfWithAttachments([{ name: 'note.mp3', bytes: AUDIO }]),
      });

      const { result } = renderHook(() => useAttachments('/case.pdf'));

      await waitFor(() => expect(result.current).toHaveLength(1));
      expect(fetched).toEqual(['/case.pdf']);
    });
  });

  it('lists the files a document carries', async () => {
    stubFetch({ '/case.pdf': await pdfWithAttachments([{ name: 'note.mp3', bytes: AUDIO }]) });
    const { result } = renderHook(() => useAttachments('/case.pdf'));

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].filename).toBe('note.mp3');
  });

  it('returns nothing for a document with no attachments', async () => {
    const empty = await PDFDocument.create().then((doc) => {
      doc.addPage();
      return doc.save();
    });
    const fetched = stubFetch({ '/plain.pdf': empty });

    const { result } = renderHook(() => useAttachments('/plain.pdf'));

    await waitFor(() => expect(fetched).toEqual(['/plain.pdf']));
    expect(result.current).toEqual([]);
  });

  it('guesses a MIME type per file, which is what picks player vs download', async () => {
    stubFetch({
      '/case.pdf': await pdfWithAttachments([
        { name: 'note.mp3', bytes: AUDIO },
        { name: 'transcript.pdf', bytes: OTHER },
      ]),
    });
    const { result } = renderHook(() => useAttachments('/case.pdf'));

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((a) => a.mimeType)).toEqual(['audio/mpeg', null]);
  });

  it('reports a size, so the indicator can say what a click will cost', async () => {
    stubFetch({ '/case.pdf': await pdfWithAttachments([{ name: 'note.mp3', bytes: AUDIO }]) });
    const { result } = renderHook(() => useAttachments('/case.pdf'));

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].size).toBe(AUDIO.length);
  });

  it('drops the previous file’s attachments when the document changes', async () => {
    stubFetch({
      '/first.pdf': await pdfWithAttachments([{ name: 'first.mp3', bytes: AUDIO }]),
      '/second.pdf': await pdfWithAttachments([{ name: 'second.mp3', bytes: AUDIO }]),
    });

    const { result, rerender } = renderHook(({ path }) => useAttachments(path), {
      initialProps: { path: '/first.pdf' },
    });
    await waitFor(() => expect(result.current[0]?.filename).toBe('first.mp3'));

    rerender({ path: '/second.pdf' });

    // The guard here is against the old list lingering against the new
    // document, which reads as the new file having attachments it does not.
    await waitFor(() => expect(result.current[0]?.filename).toBe('second.mp3'));
  });

  it('survives a document that cannot be read', async () => {
    // A malformed or missing file should leave the viewer running with no
    // panel, rather than taking the view down with an unhandled rejection.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetch({});

    const { result } = renderHook(() => useAttachments('/missing.pdf'));

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(result.current).toEqual([]);

    consoleError.mockRestore();
  });

  /**
   * The point of the whole design: an attachment can be hundreds of megabytes,
   * and almost nobody plays one. Listing must not read them.
   */
  describe('laziness', () => {
    it('does not read any attachment just to list it', async () => {
      const fetched = stubFetch({
        '/case.pdf': await pdfWithAttachments([
          { name: 'huge.mp3', bytes: AUDIO },
          { name: 'also-huge.wav', bytes: AUDIO },
        ]),
      });

      const { result } = renderHook(() => useAttachments('/case.pdf'));
      await waitFor(() => expect(result.current).toHaveLength(2));

      // One fetch — the parse that produced the list. Nothing has been
      // decoded, and no second request has been made on any file's behalf.
      expect(fetched).toEqual(['/case.pdf']);
    });

    it('reads the bytes only when an attachment is actually asked for', async () => {
      stubFetch({ '/case.pdf': await pdfWithAttachments([{ name: 'note.mp3', bytes: AUDIO }]) });

      const { result } = renderHook(() => useAttachments('/case.pdf'));
      await waitFor(() => expect(result.current).toHaveLength(1));

      expect(await result.current[0].read()).toEqual(AUDIO);
    });

    it('reads each file separately, so one player does not pull in the rest', async () => {
      stubFetch({
        '/case.pdf': await pdfWithAttachments([
          { name: 'wanted.mp3', bytes: AUDIO },
          { name: 'unwanted.mp3', bytes: OTHER },
        ]),
      });

      const { result } = renderHook(() => useAttachments('/case.pdf'));
      await waitFor(() => expect(result.current).toHaveLength(2));

      expect(await result.current[0].read()).toEqual(AUDIO);
    });

    it('reuses one re-parse across several attachments', async () => {
      const fetched = stubFetch({
        '/case.pdf': await pdfWithAttachments([
          { name: 'one.mp3', bytes: AUDIO },
          { name: 'two.mp3', bytes: OTHER },
        ]),
      });

      const { result } = renderHook(() => useAttachments('/case.pdf'));
      await waitFor(() => expect(result.current).toHaveLength(2));

      await result.current[0].read();
      await result.current[1].read();

      // The listing parse, plus exactly one re-parse shared by both reads —
      // not one per attachment.
      expect(fetched).toEqual(['/case.pdf', '/case.pdf']);
    });
  });
});
