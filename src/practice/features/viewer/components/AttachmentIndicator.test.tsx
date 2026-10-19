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

/** An attachment as the store holds it: its info, and the reader for its bytes. */
function attachment(filename: string, read: ReadAttachment = () => new Uint8Array([1])) {
  const info = { name: filename, filename } as AttachmentInfo;
  return { info, read };
}

/** Put attachments in the store, as the loader does once they are extracted. */
function storeAttachments(...items: ReturnType<typeof attachment>[]) {
  useViewerStore.setState({
    attachments: items.map((i) => i.info),
    attachmentReader: new Map(items.map((i) => [i.info.name, i.read])),
  });
}

describe('AttachmentIndicator', () => {
  beforeEach(() => {
    useViewerStore.setState(useViewerStore.getInitialState(), true);
    // jsdom has no blob URLs; pressing play makes one
    let counter = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:mock-${counter++}`),
      revokeObjectURL: vi.fn(),
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

  it('skips an attachment that has no reader', () => {
    // Listed but unreadable: a play button would do nothing
    useViewerStore.setState({
      attachments: [{ name: 'lost.mp3', filename: 'lost.mp3' } as AttachmentInfo],
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
    const { unmount } = render(<AttachmentIndicator />);
    await userEvent.click(screen.getByRole('button', { name: 'call-1.mp3' }));

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-0');
  });
});
