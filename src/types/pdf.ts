export interface PdfMetadata {
  id: string;
  caseNumber: string;
  fileName: string;
  filePath: string;
  title: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  totalPages: number;
  fileSize: string;
  createdDate: string;
  lastModified: string;
  language: string;
  status: string;
}

/** The existing fields the case stamp across the top of every page is built from. */
export type CaseStamp = Pick<PdfMetadata, 'id' | 'caseNumber' | 'title' | 'createdDate'>;
