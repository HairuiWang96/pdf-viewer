// Stand-in for the other project's createCaseStamp, which returns the PDF with
// the case stamp printed on it. The practice does not stamp, so this returns
// null ("no stamp"); the tests replace it with a mock.
import type { DocumentDetailsData, PDFBytes } from '../types/document';

export async function createCaseStamp(
  document: PDFBytes,
  details: DocumentDetailsData,
): Promise<PDFBytes | null> {
  void document;
  void details;
  return null;
}
