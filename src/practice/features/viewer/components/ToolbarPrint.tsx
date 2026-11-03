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

  // The timer that ends the spinner, cleared if the button goes away first
  const spinnerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(spinnerTimer.current), []);

  const print = () => {
    printPdf(document, { delayMs });
    if (delayMs === 0) return;

    setIsPreparing(true);
    // Ends with the wait, a few ms before the print itself (which waits from
    // the frame's load, just after the click). flushSync redraws the button
    // at once, before the print dialog pauses the page.
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
