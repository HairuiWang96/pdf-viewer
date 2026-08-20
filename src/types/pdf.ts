export interface PdfMetadata {
  id: string;
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
