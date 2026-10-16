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
//
// Like the other project's current version, it is handed the PDF's bytes
// (downloaded by the document loader) instead of a url. Attachments are
// extracted by the loader too, so Kendo's document is no longer passed up.
// Unlike it, attachments and readAttachment are still props, since the
// practice ToolbarAttachments does not read the store yet.
import { Children, cloneElement, useCallback, useMemo, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { PDFViewer } from '@progress/kendo-react-all';
import type { PDFViewerHandle, PDFViewerTool } from '@progress/kendo-react-all';
import type { AttachmentInfo, ReadAttachment } from '../types/attachments';
import type { PDFBytes } from '../types/document';
import { useFitWidthZoom } from '../hooks/useFitWidthZoom';
import { MIN_ZOOM } from '../utils/fitWidthZoom';
import { ToolbarAttachments } from './ToolbarAttachments';

interface PDFDocViewerProps {
  document?: PDFBytes | null;
  isMobile: boolean;
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
  document,
  isMobile,
  attachments,
  readAttachment,
}: PDFDocViewerProps) {
  const viewerRef = useRef<PDFViewerHandle | null>(null);

  // Kendo gets a copy: pdf.js hands the buffer it is given to its worker,
  // which empties it, and the store's bytes are still needed (attachments,
  // stamping). Once per document, since useMemo keeps the same copy.
  const viewerData = useMemo(() => (document ? new Uint8Array(document) : undefined), [document]);

  // viewerData changes when a new document's viewer appears, which is when
  // the hook has to start watching it
  const { zoom, handleZoom, fitToWidth } = useFitWidthZoom(viewerRef, isMobile, viewerData);

  // Kendo has parsed the PDF and laid it out: only now are both sizes known.
  // A new document is always fitted, even if the last one was zoomed by hand.
  const handleLoad = useCallback(() => {
    void fitToWidth();
  }, [fitToWidth]);

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

  if (!viewerData) return <div />;

  return (
    <PDFViewer
      ref={viewerRef}
      arrayBuffer={viewerData.buffer}
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
