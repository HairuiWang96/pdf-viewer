// Stand-in for the other project's utils/richMediaAudio.ts, so useAttachments.ts
// can import from the same path. The tests mock it; this body never runs there.
import type { PDF } from '@libpdf/core';

export interface RichMediaAudio {
  name: string;
  filename: string;
  mimeType?: string;
  read: () => Uint8Array | null;
}

export function findRichMediaAudio(pdf: PDF): RichMediaAudio[] {
  void pdf;
  return [];
}
