// Practice copy of PDFDocViewer from the other project, after its merge on
// 2026-10-19 (the download progress bar). Only here to test against.
//
// Changed from the pasted version:
//   - `if (!viewerData) return <div />` moved below the last hook. It was
//     above renderLoader's useCallback, so a render without bytes ran one hook
//     fewer than the next: "Rendered more hooks than during the previous render"
//
// Changed since (proposed, not in doc-viewer yet): the toolbar gets our own
// print button (ToolbarPrint) where Kendo's was, before the attachments button.
interface PDFDocViewerProps {
  document?: PDFBytes | null;
  isMobile: boolean;
}

import { useCallback, useRef, useMemo, Children, cloneElement, useState, useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { PDFViewer, PDFViewerHandle, ProgressBar } from '@progress/kendo-react-all';
import { useFitWidthZoom } from '../../hooks/useFitWidthZoom';
import { MIN_ZOOM } from '../../utils/fitWidthZoom';
import { ToolbarAttachments } from '../ToolbarAttachments';
import { ToolbarPrint } from '../ToolbarPrint';
import type { PDFBytes } from '../../types/document';
import { toolsMobile, toolsDesktop } from './PDFViewerTools';
import { useViewerStore } from '../../data/viewerStore';

// This will be removed when we switch to utilizing an actual request
async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function PDFDocViewer({ document, isMobile }: PDFDocViewerProps) {
  const viewerRef = useRef<PDFViewerHandle | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const { isDocumentLoading } = useViewerStore.getState();

  useEffect(() => {
    // The progress bar loader will be updated to use actual request for loading once the
    // connection to BE is up.
    async function loadingDelay() {
      setIsLoading(true);
      setProgress(0);

      const totalSteps = 10;
      const delayTime = 300;

      for (let i = 1; i <= totalSteps; i++) {
        await delay(delayTime);

        const currentProgress = i * 10;
        setProgress(currentProgress);
      }
      await delay(200);
      setIsLoading(false);
    }
    if (isDocumentLoading) {
      void loadingDelay();
    }
  }, [isDocumentLoading]);

  const viewerData = useMemo(() => (document ? new Uint8Array(document) : undefined), [document]);

  const { zoom, handleZoom, fitToWidth } = useFitWidthZoom(viewerRef, isMobile, viewerData);

  const handleLoad = useCallback(() => {
    void fitToWidth();
  }, [fitToWidth]);

  // 'tools' only takes Kendo's built-in names, so the print and attachments buttons are added by copying Kendo's toolbar with two more children at the end
  const renderToolbar = useCallback(
    (defaultRendering: ReactElement<{ children?: ReactNode }>) => {
      if (isLoading || !document) return <></>;
      return cloneElement(
        defaultRendering,
        undefined,
        ...Children.toArray(defaultRendering.props.children),
        // The store's bytes, not viewerData: pdf.js empties the buffer the
        // viewer is given, so printing that would print an empty file
        <ToolbarPrint key="print" document={document} />,
        <ToolbarAttachments key="attachment" />,
      );
    },
    [isLoading, document],
  );

  // prevent confusion from back2back loaders when pdfviewer loading pdf from memory
  // progress bar loads pdf to client -> this loads from client memory to pdfViewer so it never takes
  // longer than a second or two at most since we already have the bytearray
  const renderLoader = useCallback((loader: React.ReactElement<unknown> | null) => {
    return loader && <></>;
  }, []);

  // After every hook: the same hooks must run on every render
  if (!viewerData) return <div />;

  return (
    <>
      {isDocumentLoading || isLoading ? (
        <div
          style={{ height: '100vh' }}
          className="k-d-flex k-justify-content-center k-align-items-center"
        >
          <ProgressBar
            style={{ width: '50%' }}
            value={progress}
            label={(props) => `${props.value}%`}
            animation={false}
            min={0}
            max={100}
            progressStyle={{ backgroundColor: 'green' }}
          />
        </div>
      ) : (
        <PDFViewer
          ref={viewerRef}
          arrayBuffer={viewerData?.buffer ?? undefined}
          style={{ height: '100%' }}
          tools={isMobile ? toolsMobile : toolsDesktop}
          zoom={zoom}
          minZoom={MIN_ZOOM}
          onZoom={handleZoom}
          onLoad={handleLoad}
          onRenderToolbar={renderToolbar}
          onRenderLoader={renderLoader}
        />
      )}
    </>
  );
}
