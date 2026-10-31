import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for printPdf: the PDF's bytes go into a hidden iframe, which prints.
 *
 * jsdom can't show a PDF or print, so these check our side only: the blob
 * handed to the frame, that the frame is hidden but printable, that print()
 * runs once the frame has loaded, the new-tab fallback, and the clean-up.
 * Whether the browser prints the pages to fit the paper needs a real browser.
 */

// printPdf keeps the last print's frame in its module, so each test imports a
// fresh copy rather than inheriting the one before it.
//
// This only declares an empty variable with the function's type; beforeEach
// fills it. With a normal import at the top, every test would share that
// memory: test A's leftover frame would be revoked by test B's first print,
// failing B's "nothing revoked yet" check because of A.
let printPdf: (bytes: Uint8Array) => void;

// jsdom has no blob URLs, so these stand in and record what they are given.
// Each call gets the next URL: blob:fake/1, blob:fake/2, …
let urlCount = 0;
const createObjectURL = vi.fn<(blob: Blob) => string>(() => `blob:fake/${++urlCount}`);
const revokeObjectURL = vi.fn();

const pdfBytes = new Uint8Array([37, 80, 68, 70]); // "%PDF"

const frames = () => document.querySelectorAll('iframe');

/** Replace the frame window's print() (and focus(), which jsdom only logs
 * "not implemented" for), returning the print spy. */
function spyOnFrame(frame: HTMLIFrameElement, print: () => void = () => {}) {
  vi.spyOn(frame.contentWindow!, 'focus').mockImplementation(() => {});
  return vi.spyOn(frame.contentWindow!, 'print').mockImplementation(print);
}

/** Print, then let the frame "finish loading". */
function printAndLoad(print?: () => void) {
  printPdf(pdfBytes);
  const frame = frames()[frames().length - 1];
  spyOnFrame(frame, print);
  frame.dispatchEvent(new Event('load'));
  return { frame };
}

describe('printPdf', () => {
  beforeEach(async () => {
    // Forget every loaded module, then load printPdf.ts again from scratch, so
    // its memory of the last print starts empty. The brackets let the
    // destructuring fill the existing variable rather than declare a new one.
    vi.resetModules();
    ({ printPdf } = await import('./printPdf'));
    urlCount = 0;
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('loads the frame with the PDF as a blob', () => {
    printPdf(pdfBytes);

    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('application/pdf');
    expect(frames()[0].src).toBe('blob:fake/1');
  });

  it('hides the frame by size, not display: none, which some browsers won’t print', () => {
    printPdf(pdfBytes);

    // The size itself lives in global.css under .print-frame
    expect(frames()[0].className).toBe('print-frame');
    expect(frames()[0].style.display).not.toBe('none');
    expect(frames()[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('prints once the frame has loaded, not before', () => {
    printPdf(pdfBytes);
    const print = spyOnFrame(frames()[0]);
    expect(print).not.toHaveBeenCalled();

    frames()[0].dispatchEvent(new Event('load'));

    expect(print).toHaveBeenCalledOnce();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('opens the PDF in a new tab when the browser refuses to print the frame', () => {
    printAndLoad(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(window.open).toHaveBeenCalledWith('blob:fake/1', '_blank');
  });

  it('keeps the frame after printing, as the dialog may still be opening', () => {
    printAndLoad();

    expect(frames()).toHaveLength(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('cleans up the last print’s frame and URL when printing again', () => {
    const { frame: first } = printAndLoad();

    printAndLoad();

    expect(frames()).toHaveLength(1);
    expect(frames()[0]).not.toBe(first);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake/1');
  });
});
