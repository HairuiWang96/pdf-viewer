// Proposed, not in doc-viewer yet: replaces Kendo's print button, which prints
// pictures of the pages that don't fit the paper and can come out in the wrong
// order (kendo-react #3742 and #1819, see KENDO-LIMITATIONS.md).
//
// Prints the PDF itself instead: its bytes go into a hidden iframe, and the
// browser's own PDF printing fits each page to the paper, in page order.

// The last print's iframe and blob URL. Chrome opens the print dialog after
// print() returns and fires no "afterprint" for a PDF, so there is no safe
// moment to remove them; the next print (or leaving the page) cleans up.
let previous: { iframe: HTMLIFrameElement; url: string } | null = null;

export function printPdf(bytes: Uint8Array) {
  if (previous) {
    previous.iframe.remove();
    URL.revokeObjectURL(previous.url);
  }

  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const iframe = document.createElement('iframe');
  // Hidden by size, not display: none, which some browsers won't print
  iframe.className = 'print-frame';
  iframe.title = 'PDF for printing';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;

  iframe.addEventListener('load', () => {
    // Only print() is called on the frame. Firefox shows the PDF in its own
    // viewer from another origin, so reading anything inside it would throw.
    try {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) throw new Error('No window to print');
      frameWindow.focus();
      frameWindow.print();
    } catch {
      // The browser refused (some mobile browsers): open the PDF in a new tab
      // to print from there
      window.open(url, '_blank');
    }
  });

  iframe.src = url;
  document.body.appendChild(iframe);
  previous = { iframe, url };
}
