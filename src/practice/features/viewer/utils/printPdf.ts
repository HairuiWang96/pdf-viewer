// Proposed, not in doc-viewer yet: replaces Kendo's print button, which prints
// pictures of the pages that don't fit the paper and can come out in the wrong
// order (kendo-react #3742 and #1819, see KENDO-LIMITATIONS.md).
//
// Prints the PDF itself instead: its bytes go into a hidden iframe, and the
// browser's own PDF printing fits each page to the paper, in page order.

// The last print's iframe and blob URL, kept rather than cleaned up (frame
// removed, URL freed with revokeObjectURL) straight after printing. Neither
// obvious moment is safe in Chrome (known behaviour, not tested here):
//   - Right after print() returns: too early. print() returns at once and the
//     dialog opens afterwards, still reading the PDF from the frame for its
//     preview; removing it then would break the preview.
//   - On "afterprint" (the dialog has closed): never comes. Chrome doesn't
//     fire it when the page printed is a PDF in a frame.
// So the next print cleans up the last one (top of printPdf), and leaving the
// page frees everything anyway. At most one frame and one PDF copy stay.
let previous: { iframe: HTMLIFrameElement; url: string } | null = null;

// The wait ToolbarPrint uses in Safari. Without a wait, any file could print
// blank there; with 3 seconds it printed correctly in testing (Safari 26).
// Printing this long after the click, Safari first asks "This webpage is
// trying to print. Do you want to print this webpage?"
export const SAFARI_PRINT_DELAY_MS = 3000;

interface PrintOptions {
  // How long to wait after the frame loads before printing.‼️ Safari fires
  // "load" before its PDF viewer has opened the file, and printing then gives
  // blank pages; nothing tells us when it is ready, so ToolbarPrint waits.
  delayMs?: number;
}

export function printPdf(bytes: Uint8Array, { delayMs = 0 }: PrintOptions = {}) {
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

  const print = () => {
    // Stop if this frame is no longer the latest one. That happens when Print
    // is clicked again during the Safari wait: the second click removes this
    // frame and makes a new one, which does the printing. Without this check,
    // this removed frame (no window left) would end up in the catch below and
    // open an unwanted new tab.
    if (previous?.iframe !== iframe) return;

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
  };

  // ‼️"load" only means the file has arrived in the frame, not that the
  // browser's PDF viewer has drawn it. Chrome and Edge wait for their viewer
  // when printing; Safari doesn't, so it needs delayMs.
  //
  // Nothing inside this () => { … } runs now. addEventListener('load', fn)
  // only stores fn and calls it when the frame finishes loading, a few ms
  // later. So the print timer starts then, not when printPdf is called.
  // (Code inside a function handed to something else runs later: this
  // listener, setTimeout(print, …), and print itself.)
  iframe.addEventListener('load', () => {
    // ④ in ToolbarPrint's timeline: the print timer starts now, a few ms after
    // its spinner timer, so the spinner ends just before printing
    if (delayMs > 0) setTimeout(print, delayMs);
    else print();
  });

  iframe.src = url;
  document.body.appendChild(iframe);
  previous = { iframe, url };
}

// ── The whole print, in order: from the click to the print dialog ──
//
// Two different functions are called `print`:
//   ToolbarPrint's print   the button's click handler
//   printPdf's inner print the one that actually prints the frame (above)
// printPdf has no `return` statement: it returns at its closing `}`, like any
// function. The `return` inside the inner print belongs to that, not printPdf.
//
// Phase A, the click. Runs straight through, within about a millisecond:
//    1  ToolbarPrint   onClick={print} runs ToolbarPrint's print
//    2  ToolbarPrint   calls printPdf(document, { delayMs }); into printPdf:
//    3  printPdf       removes the previous print's frame, if any
//    4  printPdf       URL.createObjectURL: the bytes become a blob URL
//    5  printPdf       createElement('iframe'): the frame, in memory only
//    6  printPdf       const print = () => { … }: DEFINED, stored, NOT run
//    7  printPdf       addEventListener('load', …): REGISTERED, NOT run
//    8  printPdf       iframe.src = url
//    9  printPdf       appendChild: the frame goes on the page; the browser
//                      STARTS loading the PDF in the background
//   10  printPdf       previous = { iframe, url }: remembers this frame
//   11  printPdf       reaches `}`: printPdf returns to ToolbarPrint
//   12  ToolbarPrint   Chrome/Edge (delayMs 0): `return`; the click is done
//   12' ToolbarPrint   Safari: setIsPreparing(true) and the spinner timer; done
//   Nothing has printed yet: steps 6 and 7 only stored functions.
//
// Phase B, a few ms later, the frame finishes loading:
//   13  browser        fires `load` on the iframe
//   14  printPdf       the listener stored in step 7 runs now
//   15  printPdf       Chrome/Edge: calls the inner print() at once
//   15' printPdf       Safari: setTimeout(print, delayMs), so it runs 3 s later
//
// Phase C, the inner print runs (the function stored in step 6):
//   16  printPdf       not the latest frame any more (Print clicked again)? stop
//   17  printPdf       frameWindow.focus(), then .print(): the dialog opens
//   17' printPdf       the browser refused (it threw): window.open(url) instead
//
// In short:
//   click → ToolbarPrint's print → printPdf: build frame, STORE print,
//   STORE listener, add frame → return
//   … frame loads … → listener runs → (Safari: wait 3 s) → inner print → dialog
//
// The tests do the same by hand: printAndLoad calls printPdf (steps 2-11),
// swaps in a fake print, then dispatchEvent(new Event('load')) acts out step
// 13, so steps 14-17 run.
