import './PdfViewer.css';

interface PdfViewerProps {
  filePath: string;
}

/** Where the prebuilt PDF.js viewer lives under public/. */
const PDFJS_VIEWER = '/pdfjs/web/viewer.html';

/**
 * Self-hosted PDF.js viewer — the third option the iframe branch's comments
 * listed, now taken.
 *
 * The iframe branch embeds the PDF URL directly, which hands rendering to
 * whatever viewer the browser ships: PDFium on Chrome, Adobe's engine on
 * Edge, pdf.js on Firefox, and nothing usable on WebKit — where only page 1
 * renders, unscaled, with pages 2..n unreachable. The toolbar, the panels,
 * and the mobile behaviour are all the browser's to decide, not ours.
 *
 * Pointing the same iframe at our own copy of Mozilla's viewer replaces that
 * lottery with one renderer we ship and control. It costs ~12 MB of static
 * assets and buys:
 *   - the same toolbar in every browser, mobile included
 *   - the sidebar PDF.js already has: thumbnails, bookmarks/outline, and
 *     attachments — the two panels the other branches had to hand-build
 *   - AcroForm filling, find-in-document, print, rotate
 *
 * It stays entirely inside our own origin: static files, no CDN, no client
 * ID, no call to anyone. That is what makes it viable where an embedded
 * third-party viewer service would not be.
 *
 * The legacy build is deliberate — see the react-pdf branch's note on the
 * `Map.prototype.getOrInsertComputed` polyfill Safari needs.
 *
 * Assets live in public/pdfjs/ (source maps and Mozilla's bundled sample PDF
 * removed). Since the viewer is same-origin, `iframe.contentWindow
 * .PDFViewerApplication` is reachable if this ever needs to sync page state
 * with the thumbnail sidebar.
 */
export default function PdfViewer({ filePath }: PdfViewerProps) {
  // The viewer resolves `file` itself, so it has to survive being a query
  // value — an unencoded path with a & or # in it would truncate.
  const viewerSrc = `${PDFJS_VIEWER}?file=${encodeURIComponent(filePath)}`;

  return (
    <div className="pdf-viewer">
      <iframe
        // Remounting on file change resets the viewer's zoom, scroll and
        // sidebar state for the new document.
        key={filePath}
        className="pdf-iframe"
        src={viewerSrc}
        title="PDF Document"
      />
    </div>
  );
}
