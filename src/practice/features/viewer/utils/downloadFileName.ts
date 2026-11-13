// Proposed, not in doc-viewer yet: the name Kendo's download button saves
// the PDF under (PDFViewer's saveFileName). Without it, Kendo uses
// "Document", so every download was Document.pdf.
//
// [doc id]-[case number].pdf, or [doc id].pdf when no case is selected:
//   downloadFileName('DOC-123', '2026-CR-00912')  → 'DOC-123-2026-CR-00912.pdf'
//   downloadFileName('DOC-123', undefined)        → 'DOC-123.pdf'
// No doc id yet: undefined, so Kendo keeps its own default.
//
// Not a Content-Disposition header: Kendo saves the bytes it already has
// (a Blob made in the browser), so no server response is involved.
export function downloadFileName(documentId?: string | null, caseNumber?: string | null) {
  if (!documentId) return undefined;
  return caseNumber ? `${documentId}-${caseNumber}.pdf` : `${documentId}.pdf`;
}
