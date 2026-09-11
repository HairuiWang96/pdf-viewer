import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PdfAttachments from './PdfAttachments';
import type { AttachmentSource } from './useAttachments';
import { guessAudioMimeType } from './attachments';

/**
 * The panel takes a parsed document and nothing else, so these tests hand it a
 * stand-in with just the `getAttachments` method it actually calls — no viewer
 * and no pdf.js involved.
 */

function bytes(...values: number[]) {
  return new Uint8Array(values);
}

/** A document carrying the given files, keyed the way pdf.js keys them. */
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

describe('PdfAttachments', () => {
  let createdUrls: string[];

  beforeEach(() => {
    createdUrls = [];

    // jsdom implements neither, and the panel depends on both.
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

  it('renders nothing before a document has loaded', () => {
    const { container } = render(<PdfAttachments source={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing at all when the document has no attachments', async () => {
    const { container } = render(<PdfAttachments source={documentWith()} />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('button', { name: /attachments/i })).not.toBeInTheDocument();
  });

  it('shows a collapsed row with a count once attachments are found', async () => {
    render(
      <PdfAttachments
        source={documentWith(
          { filename: 'note.mp3', content: bytes(1, 2, 3) },
          { filename: 'voicemail.wav', content: bytes(4, 5) },
        )}
      />,
    );

    const toggle = await screen.findByRole('button', { name: /attachments/i });
    expect(toggle).toHaveTextContent('2');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed by default — filenames should not be on screen yet.
    expect(screen.queryByText('note.mp3')).not.toBeInTheDocument();
  });

  it('reveals the attachments when the row is clicked, and hides them again', async () => {
    const user = userEvent.setup();
    render(<PdfAttachments source={documentWith({ filename: 'note.mp3', content: bytes(1) })} />);

    const toggle = await screen.findByRole('button', { name: /attachments/i });

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('note.mp3')).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('note.mp3')).not.toBeInTheDocument();
  });

  it('gives each audio attachment its own player and source', async () => {
    const user = userEvent.setup();
    render(
      <PdfAttachments
        source={documentWith(
          { filename: 'part1.mp3', content: bytes(1) },
          { filename: 'part2.mp3', content: bytes(2) },
          { filename: 'voicemail.wav', content: bytes(3) },
        )}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /attachments/i }));

    const players = document.querySelectorAll('audio');
    expect(players).toHaveLength(3);

    // The failure this guards against is every player pointing at the first
    // attachment, which looks correct until you press play.
    const sources = [...players].map((p) => p.getAttribute('src'));
    expect(new Set(sources).size).toBe(3);
  });

  it('offers a download link instead of a player for non-audio files', async () => {
    const user = userEvent.setup();
    render(
      <PdfAttachments source={documentWith({ filename: 'transcript.pdf', content: bytes(1) })} />,
    );

    await user.click(await screen.findByRole('button', { name: /attachments/i }));

    const link = screen.getByRole('link', { name: /download/i });
    expect(link).toHaveAttribute('download', 'transcript.pdf');
    expect(document.querySelector('audio')).toBeNull();
  });

  it('handles audio and non-audio in the same document', async () => {
    const user = userEvent.setup();
    render(
      <PdfAttachments
        source={documentWith(
          { filename: 'note.mp3', content: bytes(1) },
          { filename: 'transcript.pdf', content: bytes(2) },
        )}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /attachments/i }));

    expect(document.querySelectorAll('audio')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /download/i })).toBeInTheDocument();
  });

  it('releases its blob URLs on unmount so they do not leak', async () => {
    const { unmount } = render(
      <PdfAttachments
        source={documentWith(
          { filename: 'note.mp3', content: bytes(1) },
          { filename: 'other.wav', content: bytes(2) },
        )}
      />,
    );

    await screen.findByRole('button', { name: /attachments/i });
    expect(createdUrls).toHaveLength(2);

    unmount();

    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });
  });

  it('releases the old blob URLs when the document changes', async () => {
    const { rerender } = render(
      <PdfAttachments source={documentWith({ filename: 'first.mp3', content: bytes(1) })} />,
    );

    await screen.findByRole('button', { name: /attachments/i });
    expect(createdUrls).toHaveLength(1);

    rerender(
      <PdfAttachments source={documentWith({ filename: 'second.mp3', content: bytes(2) })} />,
    );

    // The first document's URL has no owner left once the second replaces it.
    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(createdUrls[0]);
    });
  });

  it('survives a document whose attachments cannot be read', async () => {
    // A malformed or unusual file can reject here; the panel should stay out
    // of the way rather than taking the page down with it.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const source: AttachmentSource = {
      getAttachments: () => Promise.reject(new Error('unreadable')),
    };

    const { container } = render(<PdfAttachments source={source} />);

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();

    consoleError.mockRestore();
  });
});
