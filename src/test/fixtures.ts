import type { PdfMetadata } from '../types';
import type { PdfAttachment } from '../components/PdfAttachments';

/**
 * Test data shared across the suites.
 *
 * Deliberately not imported from src/data/pdf-metadata.json — tests should not
 * start failing because someone edits the real content. The shape matches
 * PdfMetadata, so TypeScript catches drift if the interface changes.
 */
export function makeCase(overrides: Partial<PdfMetadata> = {}): PdfMetadata {
  return {
    id: '1',
    caseNumber: 'CASE-2026-001',
    fileName: 'q1-market-report.pdf',
    filePath: '/q1-market-report.pdf',
    title: 'Q1 2026 Market Report',
    author: 'Global Markets Research Division',
    description: 'Quarterly review of equity and fixed income markets.',
    category: 'Market Report',
    tags: ['quarterly', 'Q1'],
    totalPages: 5,
    fileSize: '38 KB',
    createdDate: '2026-04-05',
    lastModified: '2026-04-08',
    language: 'English',
    status: 'Published',
    stampText: 'INTERNAL USE ONLY',
    ...overrides,
  };
}

export const threeCases: PdfMetadata[] = [
  makeCase({ id: '1', caseNumber: 'CASE-2026-001', title: 'Q1 2026 Market Report' }),
  makeCase({
    id: '2',
    caseNumber: 'CASE-2026-002',
    title: 'Q2 2026 Market Report',
    filePath: '/q2-market-report.pdf',
  }),
  makeCase({
    id: '3',
    caseNumber: 'CASE-2026-003',
    title: 'H1 2026 Midyear Review',
    filePath: '/h1-midyear-review.pdf',
  }),
];

/**
 * Attachments as the placement components receive them — listed off the
 * document by useAttachments, which has its own suite, and crucially *not* yet
 * read. `read` is a stub here: a test that cares what happens when it resolves
 * should supply its own, and most do not, since not calling it is the normal
 * state of an attachment on screen.
 */
export function makeAttachment(overrides: Partial<PdfAttachment> = {}): PdfAttachment {
  return {
    filename: 'note.mp3',
    mimeType: 'audio/mpeg',
    size: 2048,
    read: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    ...overrides,
  };
}

/** One audio file and one that is not, which is the branch every variant has. */
export const mixedAttachments: PdfAttachment[] = [
  makeAttachment({ filename: 'note.mp3', mimeType: 'audio/mpeg' }),
  makeAttachment({ filename: 'transcript.pdf', mimeType: null }),
];
