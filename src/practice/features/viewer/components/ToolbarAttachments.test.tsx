import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolbarAttachments } from './ToolbarAttachments';
import { useViewerStore } from '../data/viewerStore';
import type { AttachmentInfo } from '../utils/extractAttachments';

/**
 * Tests for the audio button in the viewer toolbar. It reads the attachments
 * from the viewer store and opens the list in a Kendo Popup, which renders
 * into document.body. The list itself has its own suite (AttachmentIndicator).
 */

/** Put audio attachments in the store, each with a reader, as the loader does. */
function storeAttachments(...filenames: string[]) {
  useViewerStore.setState({
    attachments: filenames.map((f) => ({ name: f, filename: f }) as AttachmentInfo),
    attachmentReader: new Map(filenames.map((f) => [f, () => new Uint8Array([1])])),
  });
}

const audioButton = () => screen.getByRole('button', { name: /^Audio \(/ });

describe('ToolbarAttachments', () => {
  beforeEach(() => {
    useViewerStore.setState(useViewerStore.getInitialState(), true);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when the document has no attachments', () => {
    const { container } = render(<ToolbarAttachments />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a button named for the number of attachments', () => {
    storeAttachments('call-1.mp3', 'call-2.mp3');

    render(<ToolbarAttachments />);

    expect(screen.getByRole('button', { name: 'Audio (2)' })).toBeInTheDocument();
  });

  it('starts closed, with the list hidden', () => {
    storeAttachments('call-1.mp3');

    render(<ToolbarAttachments />);

    expect(audioButton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'call-1.mp3' })).not.toBeInTheDocument();
  });

  it('opens the list when the button is pressed', async () => {
    storeAttachments('call-1.mp3');
    render(<ToolbarAttachments />);

    await userEvent.click(audioButton());

    expect(audioButton()).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('button', { name: 'call-1.mp3' })).toBeInTheDocument();
  });

  it('closes again when the button is pressed a second time', async () => {
    storeAttachments('call-1.mp3');
    render(<ToolbarAttachments />);

    await userEvent.click(audioButton());
    await userEvent.click(audioButton());

    expect(audioButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape', async () => {
    storeAttachments('call-1.mp3');
    render(<ToolbarAttachments />);
    await userEvent.click(audioButton());

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(audioButton()).toHaveAttribute('aria-expanded', 'false'));
  });

  it('updates when the attachments arrive after the toolbar is shown', () => {
    // The loader extracts attachments after the PDF is on screen, so the
    // toolbar first renders with none and must appear once they land
    render(<ToolbarAttachments />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    storeAttachments('call-1.mp3');

    return waitFor(() => expect(screen.getByRole('button', { name: 'Audio (1)' })).toBeInTheDocument());
  });
});
