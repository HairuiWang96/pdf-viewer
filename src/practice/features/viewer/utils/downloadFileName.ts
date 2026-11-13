// Proposed, not in doc-viewer yet: the name Kendo's download button saves
// the PDF under (PDFViewer's saveFileName). Without it, Kendo uses
// "Document", so every download was Document.pdf.
//
// [doc id]-[case number].pdf, or [doc id].pdf when no case is selected, with
// -with-audio at the end when the PDF has attachments:
//   downloadFileName('DOC-123', '2026-CR-00912', false) → 'DOC-123-2026-CR-00912.pdf'
//   downloadFileName('DOC-123', undefined, false)       → 'DOC-123.pdf'
//   downloadFileName('DOC-123', '2026-CR-00912', true)  → 'DOC-123-2026-CR-00912-with-audio.pdf'
// No doc id yet: undefined, so Kendo keeps its own default.
//
// Not a Content-Disposition header: Kendo saves the bytes it already has
// (a Blob made in the browser), so no server response is involved.
export function downloadFileName(
  documentId: string | null | undefined,
  caseNumber: string | null | undefined,
  hasAudio: boolean,
) {
  if (!documentId) return undefined;
  const parts = [documentId, caseNumber, hasAudio && 'with-audio'].filter(Boolean);
  return `${parts.join('-')}.pdf`;
}
