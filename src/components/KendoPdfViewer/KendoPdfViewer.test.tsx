import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import KendoPdfViewer from './KendoPdfViewer';

/**
 * Tests for the viewer wrapper itself. The attachments panel it renders has
 * its own suite next to the component — what matters here is that the viewer
 * reports the page count and hands the parsed document over.
 *
 * KendoReact's PDFViewer needs a canvas and a pdf.js worker to mount, neither
 * of which jsdom provides, so it is replaced with a stand-in that exposes the
 * same ref shape the component reads: `pages` for the page count and
 * `document` for the pdf.js document. That is the entire contract this
 * component depends on, so mocking it tests our code without testing Kendo's.
 */

const { mockState } = vi.hoisted(() => ({
  mockState: {
    pages: [{}, {}] as unknown[],
    // Stands in for the pdf.js document Kendo parsed internally.
    document: { getAttachments: () => Promise.resolve({}) },
  },
}));

vi.mock('@progress/kendo-react-all', async () => {
  const React = await import('react');
  return {
    PDFViewer: React.forwardRef(
      (props: { onLoad?: () => void; url?: string }, ref: React.Ref<unknown>) => {
        React.useImperativeHandle(ref, () => ({
          element: null,
          props,
          pages: mockState.pages,
          document: mockState.document,
        }));
        // Kendo fires onLoad once the document is parsed; that is when the
        // component reaches for the page count and the document.
        React.useEffect(() => {
          props.onLoad?.();
        }, []);
        return <div data-testid="kendo-pdfviewer" />;
      },
    ),
    scrollToPage: vi.fn(),
  };
});

// The panel is covered by its own suite; here it only needs to record what
// the viewer passes down.
const { attachmentsProps } = vi.hoisted(() => ({ attachmentsProps: [] as unknown[] }));

vi.mock('../PdfAttachments', () => ({
  default: (props: { source: unknown }) => {
    attachmentsProps.push(props.source);
    return null;
  },
}));

const defaultProps = {
  filePath: '/case.pdf',
  fileName: 'case.pdf',
  currentPage: 1,
  onPageChange: vi.fn(),
  onLoadSuccess: vi.fn(),
  isMobile: false,
};

describe('KendoPdfViewer', () => {
  beforeEach(() => {
    attachmentsProps.length = 0;
    mockState.pages = [{}, {}];
  });

  it('reports the page count up to the parent when the document loads', async () => {
    const onLoadSuccess = vi.fn();
    render(<KendoPdfViewer {...defaultProps} onLoadSuccess={onLoadSuccess} />);

    await screen.findByTestId('kendo-pdfviewer');
    expect(onLoadSuccess).toHaveBeenCalledWith(2);
  });

  it('stays quiet about the page count when the document reports no pages', async () => {
    const onLoadSuccess = vi.fn();
    mockState.pages = [];
    render(<KendoPdfViewer {...defaultProps} onLoadSuccess={onLoadSuccess} />);

    await screen.findByTestId('kendo-pdfviewer');
    expect(onLoadSuccess).not.toHaveBeenCalled();
  });

  it('hands the parsed document to the attachments panel once it loads', async () => {
    render(<KendoPdfViewer {...defaultProps} />);

    await screen.findByTestId('kendo-pdfviewer');
    // Null on the first render, the document after onLoad — the panel is what
    // decides whether there is anything to show.
    expect(attachmentsProps[0]).toBeNull();
    expect(attachmentsProps.at(-1)).toBe(mockState.document);
  });
});
