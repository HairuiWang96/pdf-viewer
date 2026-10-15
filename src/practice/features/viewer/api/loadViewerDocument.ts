// Practice copy of the other project's document loader. Only here to test
// against.
//
// Changed from the original:
//   - passes data (every case's details) to initializeViewer, so selectCase
//     can look a picked case up
//   - `if (!data?.length)`: an empty list got past `if (!data)`, then
//     data[0] was undefined and initializeViewer crashed
//   - doStampDocument logs "Case stamp failed" (it said "Attachment
//     extraction failed"), and checks isCurrentDocument in its catch like
//     doExtractAttachments does
//   - fetchDocumentDetails gets the signal, so it can be cancelled too
//   - a missing url throws DocumentNotFoundError instead of fetching
//     "undefined" (url is optional in DocumentDetailsData)
//   - loadDocumentVierwer → loadViewerDocument (typo)
import { initializeViewer, useViewerStore } from '../data/viewerStore';
import { fetchDocumentDetails } from './fetchDocumentDetails';
import { extractAttachments } from '../utils/extractAttachments';
import { createCaseStamp } from '../utils/caseStamp';

import type { CaseNumberOptions, DocumentDetailsData, PDFBytes } from '../types/document';

function isCurrentDocument(id: string, signal: AbortSignal): boolean {
  return !signal.aborted && useViewerStore.getState().documentId === id;
}

async function doExtractAttachments(id: string, document: PDFBytes, signal: AbortSignal) {
  try {
    const attachments = await extractAttachments(document);

    if (!isCurrentDocument(id, signal)) return;

    useViewerStore.getState().setAttachments(attachments.list, attachments.readers);
  } catch (error) {
    if (!isCurrentDocument(id, signal)) return;
    console.error('Attachment extraction failed: ', error);
  }
}

async function doStampDocument(
  id: string,
  document: PDFBytes,
  details: DocumentDetailsData,
  signal: AbortSignal,
) {
  try {
    const caseStamp = (await createCaseStamp(document, details)) || null;
    if (caseStamp) {
      if (!isCurrentDocument(id, signal)) return;

      useViewerStore.getState().setStampedDocument(caseStamp);
    }
  } catch (error) {
    if (!isCurrentDocument(id, signal)) return;
    console.error('Case stamp failed: ', error);
  }
}

export async function loadViewerDocument(
  id: string,
  signal: AbortSignal,
): Promise<DocumentDetailsData[]> {
  // reset the store for this document
  useViewerStore.getState().startDocument(id);

  const data = await fetchDocumentDetails(id, signal);
  if (!isCurrentDocument(id, signal)) return [];
  if (!data?.length) {
    throw new DocumentNotFoundError();
  }

  const documentCaseDetails = data[0];

  const cases: CaseNumberOptions[] =
    data.length > 1 ? data.map((c) => ({ caseNumber: c.caseNumber })) : [];

  initializeViewer(cases, documentCaseDetails, data);

  if (!documentCaseDetails.url) {
    throw new DocumentNotFoundError();
  }
  const response = await fetch(documentCaseDetails.url, { signal });
  if (!response.ok) {
    throw new DocumentNotFoundError();
  }

  const document = new Uint8Array(await response.arrayBuffer());

  if (!isCurrentDocument(id, signal)) return [];

  useViewerStore.getState().setDocument(document);

  void doExtractAttachments(id, document, signal);
  void doStampDocument(id, document, documentCaseDetails, signal);

  return data;
}

export class DocumentNotFoundError extends Error {
  constructor() {
    super('Document not found');
    this.name = 'DocumentNotFoundError';
  }
}
