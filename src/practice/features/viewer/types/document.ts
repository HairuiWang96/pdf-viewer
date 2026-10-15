// Practice copy of the other project's types/document.ts, which the document
// loader imports from. DocumentDetailsData moved here from DocumentDetails.tsx;
// CaseNumberOptions and PDFBytes from viewerStore.ts.

// One case's details. The backend returns one of these per case the document
// belongs to.
export interface DocumentDetailsData {
  caseNumber?: string;
  caseName?: string;
  caseStampToggle?: boolean;
  restrictionStatus?: string;
  filedBy?: string;
  filedDate?: string;
  fileSize?: string | number;
  docketText?: string;
  url?: string;
}

// An entry in the Case Number dropdown
export type CaseNumberOptions = { caseNumber?: string };

export type PDFBytes = Uint8Array<ArrayBufferLike>;
