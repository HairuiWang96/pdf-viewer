import type { PDF } from '@libpdf/core';

// The only thing we need from Kendo's loaded document: its raw bytes
export interface PDFBytesSource {
  getData(): Promise<Uint8Array>;
}

// libpdf does not export this type, so take it from what getAttachments() returns
export type AttachmentInfo = ReturnType<PDF['getAttachments']> extends Map<string, infer T> ? T : never;

export type ReadAttachment = (attachment: AttachmentInfo) => Uint8Array | null;
