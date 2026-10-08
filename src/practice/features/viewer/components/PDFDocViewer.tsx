// Practice copy of PDFDocViewer from the other project, rebuilt from a photo
// of its source. Only here to test against.
//
// Changed from the original:
//   - removed the empty `import { } from '…/case-embedded-audio-media.pdf'`
//   - removed `console.log(url)`
//   - moved the tool lists out of the component and exported them, so the
//     tests can compare against them by name
import { useCallback, useRef } from 'react';
import { PDFViewer } from '@progress/kendo-react-all';
import type { PDFViewerHandle, PDFViewerTool } from '@progress/kendo-react-all';
import type { PDFBytesSource } from '../hooks/useAttachments';

interface PDFDocViewerProps {
  url?: string;
  isMobile: boolean;
  onDocumentLoad: (document: PDFBytesSource | null) => void;
}

export const toolsDesktop: PDFViewerTool[] = [
  'pager',
  'spacer',
  'zoomInOut',
  'zoom',
  'selection',
  'spacer',
  'download',
  'print',
];

export const toolsMobile: PDFViewerTool[] = ['pager', 'zoomInOut', 'download', 'print'];

export default function PDFDocViewer({ url, isMobile, onDocumentLoad }: PDFDocViewerProps) {
  const viewerRef = useRef<PDFViewerHandle | null>(null);

  const handleLoad = useCallback(() => {
    onDocumentLoad((viewerRef.current?.document as PDFBytesSource | undefined) ?? null);
  }, [onDocumentLoad]);

  if (!url) return <div />;

  return (
    <PDFViewer
      ref={viewerRef}
      url={url}
      style={{ height: '100%' }}
      tools={isMobile ? toolsMobile : toolsDesktop}
      defaultZoom={isMobile ? 0.5 : 1}
      onLoad={handleLoad}
    />
  );
}
