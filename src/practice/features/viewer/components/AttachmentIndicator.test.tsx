import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttachmentIndicator } from './AttachmentIndicator';
import { useViewerStore } from '../data/viewerStore';
import type { AttachmentInfo, ReadAttachment } from '../utils/extractAttachments';

/**
 * Tests for the attachment list. It reads everything from the viewer store,
 * so each test puts attachments and their readers there, the way the document
 * loader does after extracting them. The real Kendo Button is used.
 */

/**
 * An attachment as the store holds it: its info, and the reader for its bytes.
 * The default reader returns a fake one-byte file (`new Uint8Array([1])`): the
 * tests play no real audio, they just need some bytes for Play to use.
 *
 * In the app, pressing Play makes the reader pull the recording's real bytes
 * out of the PDF (via libpdf) as a Uint8Array, millions of bytes long.
 * AttachmentIndicator wraps them in a Blob, makes a URL from it, and hands
 * that to the <audio> player.
 */
function attachment(filename: string, read: ReadAttachment = () => new Uint8Array([1])) {
  const info: AttachmentInfo = { name: filename, filename };
  return { info, read };
}

/**
 * Put attachments in the store, as the loader does once they are extracted.
 * <AttachmentIndicator /> takes no props: it reads the store itself, so tests
 * call this (or useViewerStore.setState) BEFORE render, and beforeEach empties
 * the store again.
 */
function storeAttachments(...items: ReturnType<typeof attachment>[]) {
  useViewerStore.setState({
    attachments: items.map(i => i.info),
    // new Map(pairs) builds a Map from an array of [key, value] pairs:
    //   [['clip.mp3', readFn1], ['note.wav', readFn2]]
    //   → Map { 'clip.mp3' => readFn1, 'note.wav' => readFn2 }
    // The same name → reader shape extractAttachments builds for real.
    attachmentReader: new Map(items.map(i => [i.info.name, i.read])),
  });
}

// Kept in its own variable so tests assert on it directly, rather than on
// `URL.revokeObjectURL` (a method pulled off its object).
const revokeObjectURL = vi.fn();

describe('AttachmentIndicator', () => {
  beforeEach(() => {
    // Reset the store completely, so one test's attachments can't leak into
    // the next. getInitialState() is the store as first created; the `true`
    // means REPLACE the whole store with it, where plain setState(partial)
    // only merges the fields passed. The actions (setAttachments, …) are part
    // of the initial state, so they survive; replacing with an object without
    // them would delete them.
    useViewerStore.setState(useViewerStore.getInitialState(), true);
    // jsdom has no blob URLs; pressing play makes one
    //
    // vi.stubGlobal('URL', fake) replaces a global (usable everywhere without
    // an import: URL, window, ResizeObserver) with a fake for the test. Here:
    //   ...URL             keeps everything else the real URL has
    //   createObjectURL    returns predictable 'blob:mock-0', 'blob:mock-1', …
    //                      so tests can check the <audio> got one
    //   revokeObjectURL    a mock that records calls, so a test can check the
    //                      cleanup freed the right URL ('blob:mock-0')
    // afterEach's vi.unstubAllGlobals() puts the real URL back, so the fake
    // can't leak into other tests. The PDFDocViewer tests fake ResizeObserver
    // the same way.
    //
    //‼️ vi.fn(() => …): passing a function to vi.fn sets the mock's
    // implementation, what it does when called. So it both runs that function
    // (returning its URL) and, like any mock, records every call:
    //   vi.fn()                      records calls, returns undefined
    //   vi.fn(() => 'blob:mock-0')   records calls AND returns what the function returns
    let counter = 0;
    revokeObjectURL.mockClear();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:mock-${counter++}`),
      revokeObjectURL,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders nothing when the document has no attachments', () => {
    const { container } = render(<AttachmentIndicator />);

    expect(container).toBeEmptyDOMElement();
  });

  it('lists each audio attachment with its own play button', () => {
    storeAttachments(attachment('call-1.mp3'), attachment('call-2.wav'));

    render(<AttachmentIndicator />);

    expect(screen.getByText('Audio (2)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'call-1.mp3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'call-2.wav' })).toBeInTheDocument();
  });

  it('offers no player for a file that is not audio', () => {
    storeAttachments(attachment('call-1.mp3'), attachment('report.pdf'));

    render(<AttachmentIndicator />);

    expect(screen.getByRole('button', { name: 'call-1.mp3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'report.pdf' })).not.toBeInTheDocument();
  });

  it('plays a file the PDF declares as audio, whatever its extension', () => {
    // A recording embedded with the wrong or no extension: the declared type
    // decides, so it still gets a player
    useViewerStore.setState({
      attachments: [{ name: 'rec.bin', filename: 'rec.bin', mimeType: 'audio/x-wav' }],
      attachmentReader: new Map([['rec.bin', () => new Uint8Array([1])]]),
    });

    render(<AttachmentIndicator />);

    expect(screen.getByRole('button', { name: 'rec.bin' })).toBeInTheDocument();
  });

  it('skips an attachment that has no reader', () => {
    // Listed but unreadable: a play button would do nothing
    useViewerStore.setState({
      attachments: [{ name: 'lost.mp3', filename: 'lost.mp3' }],
      attachmentReader: new Map(),
    });

    render(<AttachmentIndicator />);

    expect(screen.queryByRole('button', { name: 'lost.mp3' })).not.toBeInTheDocument();
  });

  it('reads nothing until play is pressed', async () => {
    // Attachments can be large; listing them must not pull their bytes
    const read = vi.fn(() => new Uint8Array([1]));
    storeAttachments(attachment('call-1.mp3', read));
    render(<AttachmentIndicator />);

    expect(read).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'call-1.mp3' }));

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('plays the file whose button was pressed', async () => {
    // If every button used the same reader, every player would play the first file
    const first = vi.fn(() => new Uint8Array([1]));
    const second = vi.fn(() => new Uint8Array([2]));
    storeAttachments(attachment('call-1.mp3', first), attachment('call-2.mp3', second));
    render(<AttachmentIndicator />);

    await userEvent.click(screen.getByRole('button', { name: 'call-2.mp3' }));

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('swaps the button for a play-only player', async () => {
    storeAttachments(attachment('call-1.mp3'));
    render(<AttachmentIndicator />);

    await userEvent.click(screen.getByRole('button', { name: 'call-1.mp3' }));

    const audio = document.querySelector('audio');
    expect(audio).not.toBeNull();
    expect(audio).toHaveAttribute('src', 'blob:mock-0');
    // Hides the browser's own Download item in the player menu
    expect(audio).toHaveAttribute('controlslist', 'nodownload');
  });

  it('frees the audio’s memory when the list goes away', async () => {
    storeAttachments(attachment('call-1.mp3'));
    //‼️ render() returns several tools (rerender, unmount, container, …);
    // `{ unmount }` takes just this one. Mount = put on the page, unmount =
    // removed from it. Calling unmount() makes React run the cleanups, here
    // AttachmentIndicator's blob URL cleanup ("unmount → frees the current
    // URL"), which the revokeObjectURL mock from beforeEach records:
    //   render → Play → 'blob:mock-0' made → unmount() → revokeObjectURL('blob:mock-0')
    //
    // Its sibling, rerender(<Comp newProps />): the component STAYS with new
    // props, keeping state and refs; for each effect whose dependencies
    // changed, the old cleanup runs, then the effect again (a new url frees
    // the old one; the same url runs nothing). unmount runs EVERY cleanup and
    // nothing again. Not used here: AttachmentIndicator takes no props, so
    // tests change the store (setState) and it re-renders itself.
    //   new props → rerender · goes away → unmount · store-driven → setState
    const { unmount } = render(<AttachmentIndicator />);
    await userEvent.click(screen.getByRole('button', { name: 'call-1.mp3' }));

    // Removes the component from the page, as if it went away in the app (the
    // popup closing, or another document opening). React then runs its
    // cleanup, which should revoke the blob URL.
    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-0');
  });
});
