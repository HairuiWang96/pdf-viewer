// Stand-in for the other project's fetchDocumentDetails. The practice has no
// backend, so this always fails; the tests replace it with a mock.
//
// What the real one returns: every case's details for the document, one
// DocumentDetailsData per case it belongs to. The first entry is the one the
// page opens with. null when the document does not exist.
import type { DocumentDetailsData } from '../types/document';

export async function fetchDocumentDetails(
  id: string,
  signal?: AbortSignal,
): Promise<DocumentDetailsData[] | null> {
  void signal;
  throw new Error(`No backend in the practice copy to load document ${id}`);
}
