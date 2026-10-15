// Practice copy of PDFDocViewer from the other project, rebuilt from a photo
// of its source. Only here to test against.
//
// Changed from the original:
//   - removed the empty `import { } from '…/case-embedded-audio-media.pdf'`
//   - removed `console.log(url)`
//   - moved the tool lists out of the component and exported them, so the
//     tests can compare against them by name
//
// Added:
//   - the attachments button at the end of Kendo's toolbar
//   - fit to width (see useFitWidthZoom): the zoom is controlled, set to fit
//     the page to the viewer once the document loads, and refit when the
//     viewer's width changes
import { Children, cloneElement, useCallback, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { PDFViewer } from '@progress/kendo-react-all';
import type { PDFViewerHandle, PDFViewerTool } from '@progress/kendo-react-all';
import type { AttachmentInfo, PDFBytesSource, ReadAttachment } from '../types/attachments';
import { useFitWidthZoom } from '../hooks/useFitWidthZoom';
import { MIN_ZOOM } from '../utils/fitWidthZoom';
import { ToolbarAttachments } from './ToolbarAttachments';

interface PDFDocViewerProps {
  url?: string;
  isMobile: boolean;
  onDocumentLoad: (document: PDFBytesSource | null) => void;
  attachments: AttachmentInfo[];
  readAttachment: ReadAttachment;
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

export default function PDFDocViewer({
  url,
  isMobile,
  onDocumentLoad,
  attachments,
  readAttachment,
}: PDFDocViewerProps) {
  const viewerRef = useRef<PDFViewerHandle | null>(null);

  const { zoom, handleZoom, fitToWidth } = useFitWidthZoom(viewerRef, isMobile, url);

  const handleLoad = useCallback(() => {
    onDocumentLoad((viewerRef.current?.document as PDFBytesSource | undefined) ?? null);

    // Only now are both sizes known. A new document is always fitted, even if
    // the last one was zoomed by hand.
    void fitToWidth();
  }, [onDocumentLoad, fitToWidth]);

  // `tools` only takes Kendo's built-in names, so the attachments button is
  // added by copying Kendo's toolbar with one more child at the end
  const renderToolbar = useCallback(
    (defaultRendering: ReactElement<{ children?: ReactNode }>) =>
      cloneElement(
        defaultRendering,
        undefined,
        ...Children.toArray(defaultRendering.props.children),
        <ToolbarAttachments
          key="attachments"
          attachments={attachments}
          readAttachment={readAttachment}
        />,
      ),
    [attachments, readAttachment],
  );

  if (!url) return <div />;

  return (
    <PDFViewer
      ref={viewerRef}
      url={url}
      style={{ height: '100%' }}
      tools={isMobile ? toolsMobile : toolsDesktop}
      // Controlled so it can be fitted. Kendo's zoom buttons still work: each
      // change comes back through onZoom and is fed straight back in.
      zoom={zoom}
      minZoom={MIN_ZOOM}
      onZoom={handleZoom}
      onLoad={handleLoad}
      onRenderToolbar={renderToolbar}
    />
  );
}
