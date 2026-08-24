import './PdfViewer.css';

interface PdfViewerProps {
  filePath: string;
}

export default function PdfViewer({ filePath }: PdfViewerProps) {
  return (
    <div className="pdf-viewer">
      <iframe
        className="pdf-iframe"
        src={filePath}
        title="PDF Document"
      />
    </div>
  );
}
