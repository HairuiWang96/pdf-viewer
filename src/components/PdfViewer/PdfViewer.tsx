import './PdfViewer.css';

interface PdfViewerProps {
  filePath: string;
}

/**
 * Known limitation — mobile iframe PDF rendering:
 *
 * Mobile browsers do not provide their full native PDF viewer inside an
 * <iframe>. Only the first page is rendered as a static image — no scrolling
 * or page navigation. Opening the same PDF URL directly in a new tab works
 * fine because the browser uses its native viewer for the entire page.
 *
 * Tested on iPhone only (Safari and Chrome) — both behave the same.
 * Android behavior is unverified and needs testing.
 *
 * Possible solutions:
 *   - Use a JS PDF library (e.g. react-pdf / PDF.js) to render pages
 *     as canvas elements — see the react-pdf branch for a working example.
 *   - Use the PDF.js viewer wrapper (pdfjs/viewer.html?file=...) inside
 *     the iframe, which renders via JS instead of the native viewer.
 *   - On mobile, open the PDF in a new tab instead of embedding it.
 */
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
