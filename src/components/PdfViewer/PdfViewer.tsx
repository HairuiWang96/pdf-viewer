import './PdfViewer.css';

interface PdfViewerProps {
  filePath: string;
}

/**
 * Known limitation — mobile iframe PDF rendering:
 *
 * Mobile browsers do not provide their full native PDF viewer inside an
 * <iframe>. Only the first page renders, and it renders at the document's
 * intrinsic size rather than scaled to fit: a US-Letter page is ~612pt wide
 * inside a ~390pt-wide phone iframe, so it must be panned horizontally and
 * vertically to be read. It is not a frozen thumbnail — that one page does
 * scroll — but pages 2..n are unreachable and there is no way to fit it to
 * the screen. Opening the same PDF URL directly in a new tab works fine,
 * because the browser then uses its native viewer for the whole page.
 *
 * Nothing on this side can change it. The `#view=FitH` / `#zoom=page-fit`
 * PDF Open Parameters are an Adobe convention that Chromium partially honors
 * and WebKit ignores, and no CSS reaches inside the embedded document. The
 * iframe element itself is already sized correctly (100% / 100%).
 *
 * Related, on desktop: the toolbar is the browser's, not ours, so it differs
 * per engine. Chromium (PDFium) and Firefox (pdf.js) both show one inside an
 * iframe; Safari shows none at all. Since every iOS browser is WebKit —
 * Chrome and Firefox for iOS included — that covers all iPhones and iPads.
 *
 * Tested on iPhone (Safari and Chrome) and desktop Safari.
 * Android behavior is unverified and needs testing.
 *
 * Possible solutions:
 *   - Use a JS PDF library (e.g. react-pdf / PDF.js) to render pages
 *     as canvas elements — see the react-pdf branch, which measures the
 *     container and renders each page to fit its width.
 *   - Use the PDF.js viewer wrapper (pdfjs/viewer.html?file=...) inside
 *     the iframe, which renders via JS instead of the native viewer and so
 *     gives the same toolbar in every browser.
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
