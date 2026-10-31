// Proposed, not in doc-viewer yet: our own print button in the viewer toolbar,
// in place of Kendo's 'print' tool (see utils/printPdf.ts for why).
import { Button } from '@progress/kendo-react-buttons';
import { printIcon } from '@progress/kendo-svg-icons';
import { printPdf } from '../utils/printPdf';

interface ToolbarPrintProps {
  // The same PDF the viewer shows, so the printout matches the screen
  // (stamped or not). The store's bytes, not the viewer's copy, which pdf.js
  // empties once it has read it.
  document: Uint8Array;
}

export function ToolbarPrint({ document }: ToolbarPrintProps) {
  return (
    <Button
      type="button"
      fillMode="flat"
      svgIcon={printIcon}
      title="Print"
      aria-label="Print"
      onClick={() => printPdf(document)}
    />
  );
}
