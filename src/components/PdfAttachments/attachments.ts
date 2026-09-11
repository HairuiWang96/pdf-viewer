/**
 * Helpers for the embedded-file attachments the PDF carries.
 *
 * Kept out of the component file so the pure logic can be unit tested
 * directly, and so the component module only exports a component (which is
 * what React Fast Refresh expects).
 */

// pdf.js attachments carry raw bytes and a filename, no MIME type — guess one
// from the extension so the browser knows how to play/handle the Blob.
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

export interface PdfAttachment {
  filename: string;
  url: string;
  mimeType: string | null;
}

/** The shape pdf.js hands back from `getAttachments()`. */
export interface RawAttachment {
  filename: string;
  content: Uint8Array;
}

/**
 * Turns pdf.js's raw attachment map into blob URLs the UI can point at.
 * Callers own the returned URLs and must revoke them.
 */
export function toAttachments(raw: Record<string, RawAttachment> | undefined): PdfAttachment[] {
  return Object.values(raw ?? {}).map((att) => {
    const mimeType = guessAudioMimeType(att.filename);
    const blob = new Blob([new Uint8Array(att.content)], {
      type: mimeType ?? 'application/octet-stream',
    });
    return { filename: att.filename, url: URL.createObjectURL(blob), mimeType };
  });
}
