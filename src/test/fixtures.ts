import type { PdfMetadata } from '../types';

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
    stampedFilePath: '/q1-market-report-stamped.pdf',
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
    stampedFilePath: '/q2-market-report-stamped.pdf',
  }),
  makeCase({
    id: '3',
    caseNumber: 'CASE-2026-003',
    title: 'H1 2026 Midyear Review',
    filePath: '/h1-midyear-review.pdf',
    stampedFilePath: '/h1-midyear-review-stamped.pdf',
  }),
];
