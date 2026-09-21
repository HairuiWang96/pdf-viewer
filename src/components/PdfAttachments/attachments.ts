/**
 * The shape the attachment UI works in, and the small pure helpers around it.
 *
 * Kept out of the component files so the logic can be unit tested directly,
 * and so each component module only exports a component (which is what React
 * Fast Refresh expects).
 */

// Attachments carry raw bytes and a filename, no MIME type — guess one from
// the extension so the browser knows how to play/handle the Blob.
const AUDIO_MIME_TYPES: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
};

/** Returns null for anything we would not hand to an <audio> element. */
export function guessAudioMimeType(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? (AUDIO_MIME_TYPES[ext] ?? null) : null;
}

/**
 * One embedded file, described but not yet read.
 *
 * The split between describing and reading is the whole point of this type.
 * Everything an indicator needs — that the file exists, what it is called, how
 * big it is, whether it is playable — is known from the document's structure
 * alone. The bytes are the expensive part, and a document's attachment can be
 * arbitrarily large: an interview recording or a video runs to hundreds of
 * megabytes. Most people open a document, see that it has an attachment, and
 * never play it, so loading those bytes to render a badge is the wrong trade.
 *
 * `read` is therefore deferred and called at most once per attachment, by
 * useAttachmentUrl, when someone actually asks for the file.
 */
export interface PdfAttachment {
  /**
   * Stable identity, from the document's own object numbering — not the
   * filename, which two different files are allowed to share. Use this as the
   * React key; a list keyed by filename collapses two entries into one.
   */
  id: string;
  filename: string;
  mimeType: string | null;
  /** Bytes, as the document declares them. Null when it does not say. */
  size: number | null;
  /** 1-based page it sits on, or null when it belongs to the whole document. */
  page: number | null;
  /** Reads the bytes. Nothing is decoded or copied until this is called. */
  read: () => Promise<Uint8Array>;
}

/**
 * What to show as the attachment's name.
 *
 * The page is appended only for files that belong to one — a RichMedia asset,
 * never a document-wide attachment. It is not decoration: two annotations can
 * carry different recordings under the same filename, and without the page
 * they are two identical-looking rows with no way to tell which is which.
 */
export function attachmentLabel(attachment: PdfAttachment): string {
  return attachment.page === null
    ? attachment.filename
    : `${attachment.filename} (p. ${attachment.page})`;
}

const SIZE_UNITS = ['KB', 'MB', 'GB'];

/**
 * A short human size for the indicator.
 *
 * Shown because it is the one thing that tells someone whether pressing play
 * is a click or a download — which matters precisely because the bytes are not
 * loaded yet.
 */
export function formatSize(bytes: number | null): string | null {
  if (bytes === null || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;

  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  // One decimal below 10 (9.4 MB reads better than 9 MB), none above it.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${SIZE_UNITS[unit]}`;
}
