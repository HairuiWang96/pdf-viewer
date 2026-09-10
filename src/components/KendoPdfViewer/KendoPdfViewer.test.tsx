import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KendoPdfViewer from './KendoPdfViewer';
import { guessAudioMimeType } from './attachments';

/**
 * Tests for the viewer wrapper, focused on the attachments panel.
 *
 * KendoReact's PDFViewer needs a canvas and a pdf.js worker to mount, neither
 * of which jsdom provides, so it is replaced with a stand-in that exposes the
 * same ref shape the component reads: `pages` for the page count and
 * `document` for the pdf.js document. That is the entire contract this
 * component depends on, so mocking it tests our code without testing Kendo's.
 */

const { mockState } = vi.hoisted(() => ({
  mockState: {
    pages: [{}, {}],
    // Stands in for the pdf.js document Kendo parsed internally.
    attachments: {} as Record<string, { filename: string; content: Uint8Array }>,
    getAttachmentsImpl: null as null | (() => Promise<unknown>),
  },
}));

vi.mock('@progress/kendo-react-all', async () => {
  const React = await import('react');
  return {
    PDFViewer: React.forwardRef(
      (props: { onLoad?: () => void; url?: string }, ref: React.Ref<unknown>) => {
        React.useImperativeHandle(ref, () => ({
          element: null,
          props,
          pages: mockState.pages,
          document: {
            getAttachments:
              mockState.getAttachmentsImpl ??
              (() => Promise.resolve(mockState.attachments)),
          },
        }));
        // Kendo fires onLoad once the document is parsed; that is when the
        // component reaches for the attachments.
        React.useEffect(() => {
          props.onLoad?.();
        }, []);
        return <div data-testid="kendo-pdfviewer" />;
      },
    ),
    scrollToPage: vi.fn(),
  };
});

function bytes(...values: number[]) {
  return new Uint8Array(values);
}

const defaultProps = {
  filePath: '/case.pdf',
  fileName: 'case.pdf',
  currentPage: 1,
  onPageChange: vi.fn(),
  onLoadSuccess: vi.fn(),
  isMobile: false,
};

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

describe('KendoPdfViewer attachments panel', () => {
  let createdUrls: string[];

  beforeEach(() => {
    createdUrls = [];
    mockState.attachments = {};
    mockState.getAttachmentsImpl = null;

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

  it('shows no panel at all when the document has no attachments', async () => {
    render(<KendoPdfViewer {...defaultProps} />);

    await screen.findByTestId('kendo-pdfviewer');
    expect(screen.queryByRole('button', { name: /attachments/i })).not.toBeInTheDocument();
  });

  it('shows a collapsed row with a count once attachments are found', async () => {
    mockState.attachments = {
      a: { filename: 'note.mp3', content: bytes(1, 2, 3) },
      b: { filename: 'voicemail.wav', content: bytes(4, 5) },
    };

    render(<KendoPdfViewer {...defaultProps} />);

    const toggle = await screen.findByRole('button', { name: /attachments/i });
    expect(toggle).toHaveTextContent('2');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed by default — filenames should not be on screen yet.
    expect(screen.queryByText('note.mp3')).not.toBeInTheDocument();
  });

  it('reveals the attachments when the row is clicked, and hides them again', async () => {
    const user = userEvent.setup();
    mockState.attachments = {
      a: { filename: 'note.mp3', content: bytes(1, 2, 3) },
    };

    render(<KendoPdfViewer {...defaultProps} />);
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
    mockState.attachments = {
      a: { filename: 'part1.mp3', content: bytes(1) },
      b: { filename: 'part2.mp3', content: bytes(2) },
      c: { filename: 'voicemail.wav', content: bytes(3) },
    };

    render(<KendoPdfViewer {...defaultProps} />);
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
    mockState.attachments = {
      a: { filename: 'transcript.pdf', content: bytes(1) },
    };

    render(<KendoPdfViewer {...defaultProps} />);
    await user.click(await screen.findByRole('button', { name: /attachments/i }));

    const link = screen.getByRole('link', { name: /download/i });
    expect(link).toHaveAttribute('download', 'transcript.pdf');
    expect(document.querySelector('audio')).toBeNull();
  });

  it('handles audio and non-audio in the same document', async () => {
    const user = userEvent.setup();
    mockState.attachments = {
      a: { filename: 'note.mp3', content: bytes(1) },
      b: { filename: 'transcript.pdf', content: bytes(2) },
    };

    render(<KendoPdfViewer {...defaultProps} />);
    await user.click(await screen.findByRole('button', { name: /attachments/i }));

    expect(document.querySelectorAll('audio')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /download/i })).toBeInTheDocument();
  });

  it('releases its blob URLs on unmount so they do not leak', async () => {
    mockState.attachments = {
      a: { filename: 'note.mp3', content: bytes(1) },
      b: { filename: 'other.wav', content: bytes(2) },
    };

    const { unmount } = render(<KendoPdfViewer {...defaultProps} />);
    await screen.findByRole('button', { name: /attachments/i });
    expect(createdUrls).toHaveLength(2);

    unmount();

    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });
  });

  it('reports the page count up to the parent when the document loads', async () => {
    const onLoadSuccess = vi.fn();
    render(<KendoPdfViewer {...defaultProps} onLoadSuccess={onLoadSuccess} />);

    await screen.findByTestId('kendo-pdfviewer');
    expect(onLoadSuccess).toHaveBeenCalledWith(2);
  });

  it('survives a document whose attachments cannot be read', async () => {
    // A malformed or unusual file can reject here; the viewer itself should
    // still render rather than the whole panel taking the page down.
    mockState.getAttachmentsImpl = () => Promise.reject(new Error('unreadable'));

    render(<KendoPdfViewer {...defaultProps} />);

    expect(await screen.findByTestId('kendo-pdfviewer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /attachments/i })).not.toBeInTheDocument();
  });
});
