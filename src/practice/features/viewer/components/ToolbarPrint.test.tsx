import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolbarPrint } from './ToolbarPrint';
import { printPdf } from '../utils/printPdf';

/**
 * Tests for the print button in the viewer toolbar. The printing itself has
 * its own suite (printPdf), so here it is replaced with a mock.
 */
vi.mock('../utils/printPdf', () => ({ printPdf: vi.fn() }));

const pdfBytes = new Uint8Array([37, 80, 68, 70]); // "%PDF"

describe('ToolbarPrint', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(printPdf).mockClear();
  });

  it('shows a button named Print', () => {
    render(<ToolbarPrint document={pdfBytes} />);

    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
  });

  it('prints the bytes it was given when clicked', async () => {
    render(<ToolbarPrint document={pdfBytes} />);

    await userEvent.click(screen.getByRole('button', { name: 'Print' }));

    expect(printPdf).toHaveBeenCalledOnce();
    expect(printPdf).toHaveBeenCalledWith(pdfBytes);
  });
});
