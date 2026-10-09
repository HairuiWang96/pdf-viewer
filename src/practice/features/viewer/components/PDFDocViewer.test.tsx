import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PDFDocViewer, { toolsDesktop, toolsMobile } from './PDFDocViewer';

/**
 * Tests for the viewer wrapper around KendoReact's PDFViewer.
 *
 * Kendo's PDFViewer needs a canvas and a pdf.js worker, and jsdom has neither,
 * so it is replaced with a fake. What is under test is our side of the
 * boundary: which props we hand Kendo, and what we hand our parent once Kendo
 * has loaded. Whether the PDF actually draws, zooms or prints is Kendo's to
 * test, and needs a real browser.
 *
 * The fake does three things:
 *   1. records the props it receives, for the url, tools and zoom tests
 *   2. exposes a `document` on its ref, as Kendo does once a PDF is parsed
 *   3. calls onLoad when it mounts, as Kendo does once a PDF has loaded
 */

// vi.mock is hoisted above the imports, so the state it shares with the tests
// must be hoisted too.
const { mockState } = vi.hoisted(() => ({
  mockState: {
    document: undefined as unknown,
    received: vi.fn<(props: Record<string, unknown>) => void>(),
  },
}));

vi.mock('@progress/kendo-react-all', async () => {
  const React = await import('react');
  return {
    PDFViewer: React.forwardRef((props: { onLoad?: () => void }, ref: React.Ref<unknown>) => {
      mockState.received(props);
      React.useImperativeHandle(ref, () => ({ document: mockState.document }));
      // Once on mount, as Kendo fires onLoad once per loaded document.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      React.useEffect(() => props.onLoad?.(), []);
      return <div data-testid='kendo-pdfviewer' />;
    }),
  };
});

/** Stands in for the pdf.js document Kendo parsed. */
const fakeDocument = { getData: () => Promise.resolve(new Uint8Array([1, 2, 3])) };

/** Render with sensible defaults; each test overrides what it cares about. */
function renderViewer(props: Partial<React.ComponentProps<typeof PDFDocViewer>> = {}) {
  const onDocumentLoad = vi.fn();

  render(
    <PDFDocViewer
      url='/case.pdf'
      isMobile={false}
      onDocumentLoad={onDocumentLoad}
      attachments={[]}
      readAttachment={() => null}
      {...props}
    />,
  );

  return { onDocumentLoad };
}

/** The props the fake PDFViewer received on its latest render. Throws if it never rendered. */
function viewerProps() {
  const props = mockState.received.mock.lastCall?.[0];
  if (!props) throw new Error('PDFViewer was never rendered');
  return props;
}

describe('PDFDocViewer', () => {
  beforeEach(() => {
    mockState.received.mockClear();
    mockState.document = fakeDocument;
  });

  // Unmount after each test, or every render piles onto the same page.
  afterEach(() => {
    cleanup();
  });

  describe('which document', () => {
    it('renders no viewer when there is no url', () => {
      // The common case before a case number is chosen. Kendo must not be
      // mounted with nothing to load.
      renderViewer({ url: undefined });

      expect(screen.queryByTestId('kendo-pdfviewer')).not.toBeInTheDocument();
    });

    it('hands the url to the viewer', () => {
      // Not the helper's default, so this proves the prop is passed through
      // rather than coincidentally matching.
      renderViewer({ url: '/cases/CASE-2026-002.pdf' });

      expect(viewerProps().url).toBe('/cases/CASE-2026-002.pdf');
    });
  });

  describe('desktop and mobile', () => {
    // These check which list is chosen, not what is in it: the lists are a
    // design decision meant to change freely.
    it('uses the desktop tools at 100% zoom on desktop', () => {
      renderViewer({ isMobile: false });

      expect(viewerProps().tools).toEqual(toolsDesktop);
      expect(viewerProps().defaultZoom).toBe(1);
    });

    it('uses the mobile tools at 50% zoom on mobile', () => {
      renderViewer({ isMobile: true });

      expect(viewerProps().tools).toEqual(toolsMobile);
      expect(viewerProps().defaultZoom).toBe(0.5);
    });
  });

  describe('handing the document up', () => {
    it('passes the loaded document up to the parent', () => {
      // The audio attachments are read from this document. If the handoff
      // breaks they vanish with no error anywhere, so only this catches it.
      const { onDocumentLoad } = renderViewer();

      expect(onDocumentLoad).toHaveBeenCalledWith(fakeDocument);
    });

    it('passes null up when the viewer has no document', () => {
      // Set before rendering: the fake reads it when it mounts.
      mockState.document = undefined;

      const { onDocumentLoad } = renderViewer();

      // null, not undefined: `?? null` keeps the promise made by the prop type.
      expect(onDocumentLoad).toHaveBeenCalledWith(null);
    });
  });
});
