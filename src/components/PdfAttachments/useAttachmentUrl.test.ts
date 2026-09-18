import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAttachmentUrl } from './useAttachmentUrl';
import { makeAttachment } from '../../test/fixtures';

/**
 * The other half of laziness: turning one attachment's bytes into something a
 * player can point at, no sooner than asked, and cleaning up after.
 *
 * useAttachments lists files without reading them; this hook is what reads
 * one. Everything here is about the two ways that can go wrong — reading when
 * nobody asked, and never releasing what was read.
 *
 * Every attachment below is built once and held, never rebuilt inside the
 * render callback. A fresh identity each render is what the hook reads as "a
 * different file", so rebuilding one here would release and reset on a loop
 * and test nothing.
 */

describe('useAttachmentUrl', () => {
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

  it('starts idle, having read nothing', () => {
    const read = vi.fn(() => Promise.resolve(new Uint8Array([1])));
    const attachment = makeAttachment({ read });
    const { result } = renderHook(() => useAttachmentUrl(attachment));

    expect(result.current.state).toEqual({ status: 'idle' });
    // The whole point. Rendering an indicator must not touch the file.
    expect(read).not.toHaveBeenCalled();
    expect(createdUrls).toHaveLength(0);
  });

  it('reads and produces a URL when asked', async () => {
    const attachment = makeAttachment();
    const { result } = renderHook(() => useAttachmentUrl(attachment));

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.state).toEqual({ status: 'ready', url: 'blob:mock-0' });
  });

  it('reads once however often it is asked', async () => {
    // A double click on a large attachment would otherwise be two downloads
    // and two copies of it in memory.
    const read = vi.fn(() => Promise.resolve(new Uint8Array([1])));
    const attachment = makeAttachment({ read });
    const { result } = renderHook(() => useAttachmentUrl(attachment));

    await act(async () => {
      await Promise.all([result.current.load(), result.current.load()]);
    });
    await act(async () => {
      await result.current.load();
    });

    expect(read).toHaveBeenCalledTimes(1);
    expect(createdUrls).toHaveLength(1);
  });

  it('reports a file it cannot read, rather than failing silently', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const read = () => Promise.reject(new Error('unreadable'));
    const attachment = makeAttachment({ read });
    const { result } = renderHook(() => useAttachmentUrl(attachment));

    await act(async () => {
      expect(await result.current.load()).toBeNull();
    });

    // The indicator was right that the file exists; only reading it failed, so
    // the control says so in place instead of vanishing or taking the view down.
    expect(result.current.state).toEqual({ status: 'failed' });
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  /**
   * Failing to revoke is invisible: nothing breaks and nothing logs, memory
   * just climbs for the life of the tab — and here it climbs by the size of a
   * whole attachment. These are the only thing that catches it.
   */
  describe('blob URL lifecycle', () => {
    it('releases its URL on unmount', async () => {
      const attachment = makeAttachment();
      const { result, unmount } = renderHook(() => useAttachmentUrl(attachment));

      await act(async () => {
        await result.current.load();
      });
      unmount();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-0');
    });

    it('releases the old URL when the attachment changes', async () => {
      const { result, rerender } = renderHook(
        ({ attachment }) => useAttachmentUrl(attachment),
        { initialProps: { attachment: makeAttachment({ filename: 'first.mp3' }) } },
      );

      await act(async () => {
        await result.current.load();
      });
      rerender({ attachment: makeAttachment({ filename: 'second.mp3' }) });

      await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-0'));
      // And it is back to having read nothing, rather than showing the
      // previous file's player against the new attachment.
      expect(result.current.state).toEqual({ status: 'idle' });
    });

    it('releases a URL whose read landed after unmount', async () => {
      // The cleanup has already run and seen nothing, so this URL would
      // otherwise have no owner left to revoke it.
      let finish: (bytes: Uint8Array) => void = () => {};
      const read = () => new Promise<Uint8Array>((resolve) => (finish = resolve));

      const attachment = makeAttachment({ read });
      const { result, unmount } = renderHook(() => useAttachmentUrl(attachment));

      let pending: Promise<string | null> = Promise.resolve(null);
      act(() => {
        pending = result.current.load();
      });
      unmount();

      await act(async () => {
        finish(new Uint8Array([1]));
        expect(await pending).toBeNull();
      });

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-0');
    });
  });
});
