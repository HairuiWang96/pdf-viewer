// Proposed, not in doc-viewer yet: our own print button in the viewer toolbar,
// in place of Kendo's 'print' tool (see utils/printPdf.ts for why).
//
// In Safari it waits before printing (SAFARI_PRINT_DELAY_MS), showing a
// spinner on the button meanwhile; disabled until then, so it can't be
// clicked twice.
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@progress/kendo-react-buttons';
import { Loader } from '@progress/kendo-react-indicators';
import { printIcon } from '@progress/kendo-svg-icons';
import { printPdf, SAFARI_PRINT_DELAY_MS } from '../utils/printPdf';
import { isSafari } from '../utils/isSafari';

interface ToolbarPrintProps {
  // The same PDF the viewer shows, so the printout matches the screen
  // (stamped or not). The store's bytes, not the viewer's copy, which pdf.js
  // empties once it has read it.
  document: Uint8Array;
}

export function ToolbarPrint({ document }: ToolbarPrintProps) {
  // Read once: the browser doesn't change while the page is open
  const [delayMs] = useState(() => (isSafari() ? SAFARI_PRINT_DELAY_MS : 0));
  const [isPreparing, setIsPreparing] = useState(false);

  // The timer that ends the spinner, cleared if the button goes away first.
  // The cleanup runs only once (on unmount, with []), yet still clears the
  // right timer: spinnerTimer is a ref, and the cleanup reads .current when it
  // runs, so it gets the latest timer (from the most recent click), not
  // whatever was there when the effect started.
  const spinnerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(spinnerTimer.current), []);

  // Two timers of delayMs each: the spinner's (here) and the print's (in
  // printPdf). The spinner's starts first, so it also ends first:
  //
  //   0 ms      click: ① frame set up, ② spinner shown, ③ spinner timer starts
  //   ~5 ms     frame loaded: ④ print timer starts (printPdf's load listener)
  //   3000 ms   spinner timer fires, spinner goes away (flushSync)
  //   ~3005 ms  print timer fires, print dialog opens
  //
  // The gap is only as long as the frame took to load, which is why flushSync
  // is used: it makes sure the spinner is really gone before the print dialog
  // pauses the page.
  const print = () => {
    // ① Only sets up the hidden frame and returns. Its print timer starts
    // later, once the frame has loaded the PDF.
    printPdf(document, { delayMs });
    if (delayMs === 0) return;

    // ② Runs now, but doesn't redraw now: it asks React to redraw soon, just
    // after this click handler finishes.
    setIsPreparing(true);
    // ③ The spinner timer starts now. At the end, flushSync overrides React's
    // "redraw soon" and redraws the button at once.
    spinnerTimer.current = setTimeout(() => flushSync(() => setIsPreparing(false)), delayMs);
  };

  const label = isPreparing ? 'Preparing to print' : 'Print';

  return (
    <Button
      type="button"
      fillMode="flat"
      svgIcon={isPreparing ? undefined : printIcon}
      title={label}
      aria-label={label}
      aria-busy={isPreparing}
      disabled={isPreparing}
      onClick={print}
    >
      {isPreparing && <Loader size="small" type="infinite-spinner" />}
    </Button>
  );
}
