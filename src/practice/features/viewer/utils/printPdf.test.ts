import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';

/**
 * Tests for printPdf: the PDF's bytes go into a hidden iframe, which prints.
 *
 * jsdom can't show a PDF or print, so these check our side only: the blob
 * handed to the frame, that the frame is hidden but printable, that print()
 * runs once the frame has loaded, the new-tab fallback, and the clean-up.
 * Whether the browser prints the pages to fit the paper needs a real browser.
 */

/*
 * The ways Vitest fakes things, as used in the print tests:‼️
 *
 *   vi.fn()              Makes a brand-new fake function from nothing.
 *                        Here: createObjectURL, since jsdom has none.
 *                        Nothing to restore; mockClear() wipes its call record.
 *                        Use it when the thing doesn't exist, or to hand code
 *                        a fake (a callback, say).
 *
 *   vi.spyOn(obj, 'm')   Takes over one method on an existing object.
 *                        Here: window.open, and the frame's print and focus
 *                        (spyOnFrame). Without .mockImplementation(...) the
 *                        real method still runs, just recorded.‼️
 *                        vi.restoreAllMocks() puts the real one back.
 *
 *   vi.mock('path')      Replaces a whole file (module) for everything that
 *                        imports it, for the whole test file. Here:
 *                        ToolbarPrint's tests replace printPdf, since they only
 *                        check the button calls it right; printPdf has its own
 *                        tests (these).
 *
 * Related helpers:
 *   vi.mocked(fn)                 Fakes nothing; tells TypeScript "this is a
 *                                 mock", so vi.mocked(printPdf).mockClear()
 *                                 type-checks.
 *   vi.spyOn(obj, 'prop', 'get')  spyOn on a property rather than a method;
 *                                 'get' fakes reading it. ToolbarPrint's tests
 *                                 fake navigator.userAgent this way
 *                                 (pretendToBe).
 *   vi.stubGlobal('Name', fake)   Replaces a whole global (ResizeObserver in
 *                                 the PDFDocViewer tests); undone with
 *                                 vi.unstubAllGlobals().
 *   vi.useFakeTimers()            Fakes the clock, not a function; undone with
 *                                 vi.useRealTimers().
 *
 * All of them record their calls the same way, so the same checks work on
 * any: toHaveBeenCalled(), toHaveBeenCalledWith(...), toHaveBeenCalledOnce().
 */

// printPdf keeps the last print's frame in its module, so each test imports a
// fresh copy rather than inheriting the one before it.
//
// This only declares an empty variable with the function's type; beforeEach
// fills it. With a normal import at the top, every test would share that
// memory: test A's leftover frame would be revoked by test B's first print,
// failing B's "nothing revoked yet" check because of A.
let printPdf: (bytes: Uint8Array, options?: { delayMs?: number }) => void;

// jsdom has no blob URLs, so these stand in and record what they are given.
// Each call gets the next URL: blob:fake/1, blob:fake/2, …
let urlCount = 0;
const createObjectURL = vi.fn<(blob: Blob) => string>(() => `blob:fake/${++urlCount}`);
const revokeObjectURL = vi.fn();

// The spy on window.open (the new-tab fallback), so no real tab opens. Checked
// through this variable, not `expect(window.open)`: doc-viewer's lint
// (unbound-method) rejects taking a method off its object like that.
let openTab: MockInstance<typeof window.open>;

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
    openTab = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
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
    expect(openTab).not.toHaveBeenCalled();
  });

  it('opens the PDF in a new tab when the browser refuses to print the frame', () => {
    printAndLoad(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(openTab).toHaveBeenCalledWith('blob:fake/1', '_blank');
  });

  it('opens the PDF in a new tab when the frame has no window to print', () => {
    // A frame taken out of the page has no window (contentWindow is null).
    // Without the check, `?.print()` would silently do nothing: no print and
    // no tab.
    printPdf(pdfBytes);
    Object.defineProperty(frames()[0], 'contentWindow', { value: null });

    frames()[0].dispatchEvent(new Event('load'));

    expect(openTab).toHaveBeenCalledWith('blob:fake/1', '_blank');
  });

  describe('with a wait (delayMs, as in Safari)', () => {
    // Fake timers stand in for the wait, so a test moves time forward with
    // vi.advanceTimersByTime instead of waiting
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('prints that long after the frame has loaded, not before', () => {
      printPdf(pdfBytes, { delayMs: 3000 });
      const print = spyOnFrame(frames()[0]);
      frames()[0].dispatchEvent(new Event('load'));

      vi.advanceTimersByTime(2999);
      expect(print).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(print).toHaveBeenCalledOnce();
    });

    it('prints only the new frame when printed again during the wait', () => {
      // The first frame is removed by the second print. Without the check,
      // its timer would find no window and open the new-tab fallback.
      printPdf(pdfBytes, { delayMs: 3000 });
      const first = frames()[0];
      const firstPrint = spyOnFrame(first);
      first.dispatchEvent(new Event('load'));

      printPdf(pdfBytes, { delayMs: 3000 });
      const secondPrint = spyOnFrame(frames()[0]);
      frames()[0].dispatchEvent(new Event('load'));
      vi.advanceTimersByTime(3000);

      expect(firstPrint).not.toHaveBeenCalled();
      expect(secondPrint).toHaveBeenCalledOnce();
      expect(openTab).not.toHaveBeenCalled();
    });
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
