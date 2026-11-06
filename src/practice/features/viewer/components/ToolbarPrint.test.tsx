import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolbarPrint } from './ToolbarPrint';
import { printPdf } from '../utils/printPdf';

/**
 * Tests for the print button in the viewer toolbar. The printing itself has
 * its own suite (printPdf), so here it is replaced with a mock.
 *
 * Whether the button waits depends on the browser, read from its user-agent
 * string, so each group says which browser it pretends to be. (jsdom's own
 * string would count as Safari: it says "AppleWebKit/" and not "Chrome/".)
 */
vi.mock('../utils/printPdf', () => ({ printPdf: vi.fn(), SAFARI_PRINT_DELAY_MS: 3000 }));

const pdfBytes = new Uint8Array([37, 80, 68, 70]); // "%PDF"

function pretendToBe(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

describe('ToolbarPrint', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(printPdf).mockClear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('in Chrome and Edge', () => {
    beforeEach(() => {
      pretendToBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    });

    it('shows a button named Print', () => {
      render(<ToolbarPrint document={pdfBytes} />);

      expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
    });

    it('prints the bytes it was given straight away when clicked', async () => {
      render(<ToolbarPrint document={pdfBytes} />);

      await userEvent.click(screen.getByRole('button', { name: 'Print' }));

      expect(printPdf).toHaveBeenCalledOnce();
      expect(printPdf).toHaveBeenCalledWith(pdfBytes, { delayMs: 0 });
      // No spinner: the button stays as it was
      expect(screen.getByRole('button', { name: 'Print' })).toBeEnabled();
    });
  });

  describe('in Safari', () => {
    // Safari prints blank pages if print() runs as soon as the PDF loads, so
    // the button waits, with a spinner.
    // ‼️ fireEvent rather than userEvent: the timers are fake here, and userEvent waits on real ones.
    beforeEach(() => {
      pretendToBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15');
      vi.useFakeTimers();
    });

    it('asks printPdf to wait 3 seconds before printing', () => {
      render(<ToolbarPrint document={pdfBytes} />);

      fireEvent.click(screen.getByRole('button', { name: 'Print' }));

      expect(printPdf).toHaveBeenCalledWith(pdfBytes, { delayMs: 3000 });
    });

    it('shows a spinner and can’t be clicked again while it waits', () => {
      render(<ToolbarPrint document={pdfBytes} />);

      fireEvent.click(screen.getByRole('button', { name: 'Print' }));

      const button = screen.getByRole('button', { name: 'Preparing to print' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button.querySelector('.k-loader')).not.toBeNull();
      fireEvent.click(button);
      expect(printPdf).toHaveBeenCalledOnce();
    });

    it('goes back to Print once the wait is over', () => {
      render(<ToolbarPrint document={pdfBytes} />);
      fireEvent.click(screen.getByRole('button', { name: 'Print' }));

      // ‼️ Braces, so the callback returns nothing and act() returns nothing. A
      // callback that returns a value makes act() return a Promise, which
      // doc-viewer's lint (no-floating-promises) rejects when not awaited.
      act(() => {
        vi.advanceTimersByTime(2999);
      });
      expect(screen.getByRole('button', { name: 'Preparing to print' })).toBeDisabled();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole('button', { name: 'Print' })).toBeEnabled();
    });
  });
});
