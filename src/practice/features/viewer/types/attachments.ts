import type { PDF } from '@libpdf/core';

// The only thing we need from Kendo's loaded document: its raw bytes
export interface PDFBytesSource {
  getData(): Promise<Uint8Array>;
}

// libpdf does not export this type, so take it from what getAttachments() returns
export type AttachmentInfo = ReturnType<PDF['getAttachments']> extends Map<string, infer T> ? T : never;

export type ReadAttachment = (attachment: AttachmentInfo) => Uint8Array | null;

// Reads one specific file's bytes. The store's attachmentReader map holds one
// of these per attachment name; ReadAttachment above looks one up and calls it.
export type AttachmentReader = () => Uint8Array | null;
