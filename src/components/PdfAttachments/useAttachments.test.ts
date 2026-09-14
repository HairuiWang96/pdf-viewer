import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAttachments } from './useAttachments';
import type { AttachmentSource } from './useAttachments';
import { guessAudioMimeType } from './attachments';

/**
 * The data half of attachments: reading them off a document and owning the
 * blob URLs. The three placement components are presentational and take the
 * finished list, so they have their own suites and none of them repeat this.
 *
 * The source is a stand-in with only the `getAttachments` method the hook
 * calls — no viewer and no pdf.js involved.
 */

function bytes(...values: number[]) {
  return new Uint8Array(values);
}

function documentWith(
  ...files: { filename: string; content: Uint8Array }[]
): AttachmentSource {
  const raw = Object.fromEntries(files.map((file, index) => [`file${index}`, file]));
  return { getAttachments: () => Promise.resolve(raw) };
}

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

describe('useAttachments', () => {
  let createdUrls: string[];

  beforeEach(() => {
    createdUrls = [];

    // jsdom implements neither, and the hook depends on both.
    let counter = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => {
        const url = `blob:mock-${counter++}`;
        createdUrls.push(url);
        return url;
      }),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns nothing before a document has loaded', () => {
    const { result } = renderHook(() => useAttachments(null));

    expect(result.current).toEqual([]);
  });

  it('returns nothing for a document with no attachments', async () => {
    const source = documentWith();
    const { result } = renderHook(() => useAttachments(source));

    await waitFor(() => expect(result.current).toEqual([]));
    expect(createdUrls).toHaveLength(0);
  });

  it('turns each embedded file into its own blob URL', async () => {
    const source = documentWith(
      { filename: 'part1.mp3', content: bytes(1) },
      { filename: 'part2.mp3', content: bytes(2) },
    );
    const { result } = renderHook(() => useAttachments(source));

    await waitFor(() => expect(result.current).toHaveLength(2));
    // The failure this guards against is every entry sharing one URL, which
    // looks correct until you press play on the second player.
    expect(new Set(result.current.map((a) => a.url)).size).toBe(2);
  });

  it('guesses a MIME type per file, which is what picks player vs download', async () => {
    const source = documentWith(
      { filename: 'note.mp3', content: bytes(1) },
      { filename: 'transcript.pdf', content: bytes(2) },
    );
    const { result } = renderHook(() => useAttachments(source));

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((a) => a.mimeType)).toEqual(['audio/mpeg', null]);
  });

  /**
   * Failing to revoke is invisible: nothing breaks and nothing logs, memory
   * just climbs for the life of the tab. These are the only thing that catches
   * it.
   */
  describe('blob URL lifecycle', () => {
    it('releases its URLs on unmount', async () => {
      const source = documentWith(
        { filename: 'note.mp3', content: bytes(1) },
        { filename: 'other.wav', content: bytes(2) },
      );
      const { result, unmount } = renderHook(() => useAttachments(source));

      await waitFor(() => expect(result.current).toHaveLength(2));
      unmount();

      await waitFor(() => {
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
      });
    });

    it('releases the old URLs when the document changes', async () => {
      const { result, rerender } = renderHook(
        ({ source }) => useAttachments(source),
        { initialProps: { source: documentWith({ filename: 'first.mp3', content: bytes(1) }) } },
      );

      await waitFor(() => expect(result.current).toHaveLength(1));
      const firstUrl = result.current[0].url;

      rerender({ source: documentWith({ filename: 'second.mp3', content: bytes(2) }) });

      await waitFor(() => {
        expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl);
      });
    });
  });

  it('survives a document whose attachments cannot be read', async () => {
    // A malformed or unusual file can reject here; the hook should report an
    // empty list rather than letting an unhandled rejection take the view down.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const source: AttachmentSource = {
      getAttachments: () => Promise.reject(new Error('unreadable')),
    };

    const { result } = renderHook(() => useAttachments(source));

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(result.current).toEqual([]);

    consoleError.mockRestore();
  });
});
