// Tests for the placeholder variant (see AttachmentIndicatorWithPlaceholder.tsx's
// header). Not in doc-viewer.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AttachmentIndicatorWithPlaceholder as AttachmentIndicator } from './AttachmentIndicatorWithPlaceholder';
import { useViewerStore } from '../data/viewerStore';
import type { AttachmentInfo, ReadAttachment } from '../utils/extractAttachments';

/**
 * Tests for the attachment list. It reads everything from the viewer store,
 * so each test puts attachments and their readers there, the way the document
 * loader does after extracting them.
 *
 * jsdom draws no player, so there is no ▶ to click. A real click on ▶ makes
 * the browser fire a `play` event on the <audio>, so the tests fire that event
 * themselves (`fireEvent.play`). jsdom cannot play sound either, so the
 * element's play() is replaced with one that does nothing.
 */

/**
 * An attachment as the store holds it: its info, and the reader for its bytes.
 * The default reader returns a fake one-byte file (`new Uint8Array([1])`): the
 * tests play no real audio, they just need some bytes for ▶ to use.
 *
 * In the app, the first ▶ makes the reader pull the recording's real bytes
 * out of the PDF (via libpdf) as a Uint8Array, millions of bytes long.
 * AttachmentIndicator wraps them in a Blob, makes a URL from it, and hands
 * that to the <audio> player in place of the silent placeholder.
 */
function attachment(filename: string, read: ReadAttachment = () => new Uint8Array([1])) {
  const info: AttachmentInfo = { name: filename, filename };
  return { info, read };
}

/** Put attachments in the store, as the loader does once they are extracted. */
function storeAttachments(...items: ReturnType<typeof attachment>[]) {
  useViewerStore.setState({
    attachments: items.map((i) => i.info),
    attachmentReader: new Map(items.map((i) => [i.info.name, i.read])),
  });
}

// Kept in their own variables so tests assert on them directly, rather than on
// `URL.revokeObjectURL` and the others (methods pulled off their objects).
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
const play = vi.fn();

// The placeholder is a tiny WAV written into the address itself
const isPlaceholder = (audio: HTMLAudioElement) =>
  audio.getAttribute('src')?.startsWith('data:audio/wav;base64,') ?? false;

const players = () => Array.from(document.querySelectorAll('audio'));

describe('AttachmentIndicatorWithPlaceholder', () => {
  beforeEach(() => {
    useViewerStore.setState(useViewerStore.getInitialState(), true);
    // jsdom has no blob URLs; the first ▶ makes one
    let counter = 0;
    createObjectURL.mockReset().mockImplementation(() => `blob:mock-${counter++}`);
    revokeObjectURL.mockClear();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    play.mockReset().mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders nothing when the document has no attachments', () => {
    const { container } = render(<AttachmentIndicator />);

    expect(container).toBeEmptyDOMElement();
  });

  it('lists each audio attachment with its own player', () => {
    storeAttachments(attachment('call-1.mp3'), attachment('call-2.wav'));

    render(<AttachmentIndicator />);

    expect(screen.getByText('Audio (2)')).toBeInTheDocument();
    expect(screen.getByText('call-1.mp3')).toBeInTheDocument();
    expect(screen.getByText('call-2.wav')).toBeInTheDocument();
    expect(players()).toHaveLength(2);
  });

  it('shows a play-only player straight away, on the silent placeholder', () => {
    storeAttachments(attachment('call-1.mp3'));

    render(<AttachmentIndicator />);

    const [audio] = players();
    expect(isPlaceholder(audio)).toBe(true);
    // Hides the browser's own Download item in the player menu
    expect(audio).toHaveAttribute('controlslist', 'nodownload');
    // Waits for the user's ▶: nothing starts by itself
    expect(audio).not.toHaveAttribute('autoplay');
  });

  it('offers no player for a file that is not audio', () => {
    storeAttachments(attachment('call-1.mp3'), attachment('report.pdf'));

    render(<AttachmentIndicator />);

    expect(screen.getByText('call-1.mp3')).toBeInTheDocument();
    expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
    expect(players()).toHaveLength(1);
  });

  it('plays a file the PDF declares as audio, whatever its extension', () => {
    // A recording embedded with the wrong or no extension: the declared type
    // decides, so it still gets a player
    useViewerStore.setState({
      attachments: [{ name: 'rec.bin', filename: 'rec.bin', mimeType: 'audio/x-wav' }],
      attachmentReader: new Map([['rec.bin', () => new Uint8Array([1])]]),
    });

    render(<AttachmentIndicator />);

    expect(screen.getByText('rec.bin')).toBeInTheDocument();
    expect(players()).toHaveLength(1);
  });

  it('skips an attachment that has no reader', () => {
    // Listed but unreadable: a player would do nothing
    useViewerStore.setState({
      attachments: [{ name: 'lost.mp3', filename: 'lost.mp3' }],
      attachmentReader: new Map(),
    });

    render(<AttachmentIndicator />);

    expect(screen.queryByText('lost.mp3')).not.toBeInTheDocument();
    expect(players()).toHaveLength(0);
  });

  it('reads nothing until ▶ is pressed, and only once', () => {
    // Attachments can be large; showing the player must not pull their bytes
    const read = vi.fn(() => new Uint8Array([1]));
    storeAttachments(attachment('call-1.mp3', read));
    render(<AttachmentIndicator />);

    expect(read).not.toHaveBeenCalled();

    const [audio] = players();
    fireEvent.play(audio);
    expect(read).toHaveBeenCalledTimes(1);

    // ⏸ then ▶ again: the real audio is already in, nothing to unpack
    fireEvent.play(audio);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('swaps in the real audio on the first ▶ and plays it', () => {
    storeAttachments(attachment('call-1.mp3'));
    render(<AttachmentIndicator />);

    const [audio] = players();
    fireEvent.play(audio);

    expect(audio).toHaveAttribute('src', 'blob:mock-0');
    // Started in code, right after the swap: the placeholder was what began
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('plays the file whose player was pressed', () => {
    // If every player used the same reader, every player would play the first file
    const first = vi.fn(() => new Uint8Array([1]));
    const second = vi.fn(() => new Uint8Array([2]));
    storeAttachments(attachment('call-1.mp3', first), attachment('call-2.mp3', second));
    render(<AttachmentIndicator />);

    const [firstPlayer, secondPlayer] = players();
    fireEvent.play(secondPlayer);

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(isPlaceholder(firstPlayer)).toBe(true);
  });

  it('stays on the placeholder when the bytes cannot be read', () => {
    // The reader found nothing: no blob URL to make, nothing to play
    storeAttachments(attachment('call-1.mp3', () => null));
    render(<AttachmentIndicator />);

    const [audio] = players();
    fireEvent.play(audio);

    expect(isPlaceholder(audio)).toBe(true);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it('frees the audio’s memory when the list goes away', () => {
    storeAttachments(attachment('call-1.mp3'));
    // render() returns several tools; this test takes `unmount`
    const { unmount } = render(<AttachmentIndicator />);
    fireEvent.play(players()[0]);

    // Removes the component from the page, as if it went away in the app (the
    // popup closing, or another document opening). React then runs its
    // cleanup, which should revoke the blob URL.
    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-0');
  });

  it('has nothing to free when ▶ was never pressed', () => {
    storeAttachments(attachment('call-1.mp3'));
    const { unmount } = render(<AttachmentIndicator />);

    unmount();

    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
