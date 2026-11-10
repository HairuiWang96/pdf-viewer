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
// Firefox keeps Kendo's print instead (see kendoPrint below).
//
// Also proposed, not in doc-viewer yet: our own pager (ToolbarPager) where
// Kendo's was. It shows the page that takes up the most of the view, not
// Kendo's page at the top edge, and scrolls to pages itself (useViewerPage).
interface PDFDocViewerProps {
  document?: PDFBytes | null;
  isMobile: boolean;
}

import { useCallback, useRef, useMemo, Children, cloneElement, useState, useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { PDFViewer, PDFViewerHandle, ProgressBar } from '@progress/kendo-react-all';
import type { PDFViewerTool } from '@progress/kendo-react-all';
import { isFirefox } from '../../utils/isFirefox';
import { useFitWidthZoom } from '../../hooks/useFitWidthZoom';
import { useViewerPage } from '../../hooks/useViewerPage';
import { MIN_ZOOM } from '../../utils/fitWidthZoom';
import { ToolbarAttachments } from '../ToolbarAttachments';
import { ToolbarPager } from '../ToolbarPager';
import { ToolbarPrint } from '../ToolbarPrint';
import type { PDFBytes } from '../../types/document';
import { toolsMobile, toolsDesktop } from './PDFViewerTools';
import { useViewerStore } from '../../data/viewerStore';

// This will be removed when we switch to utilizing an actual request
async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function PDFDocViewer({ document, isMobile }: PDFDocViewerProps) {
  // Connects this component to Kendo's viewer so the zoom code can measure it.
  //   1. here: an empty box (.current is null)
  //   2. <PDFViewer ref={viewerRef}>: once on screen, Kendo fills .current with
  //      its handle { element, document, pages, props }
  //   3. useFitWidthZoom(viewerRef, …): fitToWidth reads .current.document
  //      (page 1's width) and .current.element (the .k-pdf-viewer-canvas
  //      scroll area, the screen width); the resize watch watches that area
  // A ref, not state: it is only looked at when measuring, and changing it
  // causes no re-render. The hook gets the ref itself, not .current, so it
  // always reads the latest handle, even one Kendo filled in later. The tests'
  // fake PDFViewer fills it with { document, element } via useImperativeHandle.
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

  // The viewer's own copy of the PDF's bytes. pdf.js empties the buffer it is
  // given once it has read it, so the store keeps the original for Print
  // (ToolbarPrint gets `document`, not this). useMemo copies once per PDF, not
  // on every render; with no PDF yet there is nothing to copy.

  //new Uint8Array(document) copies the bytes. It's a new array with the same contents.
  const viewerData = useMemo(() => (document ? new Uint8Array(document) : undefined), [document]);

  const { zoom, handleZoom, fitToWidth } = useFitWidthZoom(viewerRef, isMobile, viewerData);

  // Counts Kendo's onLoads, so the pager's watch starts once the viewer and
  // its pages are on screen. Not viewerData: the bytes can arrive while the
  // progress bar still shows, before there is a viewer to watch, and when it
  // appears the bytes haven't changed, so the pager stayed at "Page 1 of 0".
  const [loadCount, setLoadCount] = useState(0);
  const { page, total, goToPage } = useViewerPage(viewerRef, loadCount);

  const handleLoad = useCallback(() => {
    setLoadCount(count => count + 1);
    void fitToWidth();
  }, [fitToWidth]);

  // Firefox keeps Kendo's own print. Our print (ToolbarPrint) shows the PDF in
  // a hidden frame, which Firefox sends to Adobe or downloads unless its PDF
  // setting is "Open in Firefox". Kendo's prints pictures of the pages, so it
  // ignores that setting, and Firefox's default "shrink to fit" keeps each on
  // one sheet. Read once: the browser doesn't change while the page is open.
  const [kendoPrint] = useState(() => isFirefox());

  const tools = useMemo<PDFViewerTool[]>(() => {
    const layoutTools = isMobile ? toolsMobile : toolsDesktop;
    return kendoPrint ? [...layoutTools, 'print'] : layoutTools;
  }, [isMobile, kendoPrint]);

  // 'tools' only takes Kendo's built-in names, so our buttons are added by
  // copying Kendo's toolbar with more children: our pager first, where
  // Kendo's 'pager' tool was (it is left out of the tool lists), and print and
  // attachments at the end. A new page re-renders this, and Kendo calls it
  // again, so the pager's number follows the scroll.
  const renderToolbar = useCallback(
    (defaultRendering: ReactElement<{ children?: ReactNode }>) => {
      if (isLoading || !document) return <></>;
      return cloneElement(
        defaultRendering,
        undefined,
        <ToolbarPager key='pager' page={page} total={total} onPageChange={goToPage} />,
        ...Children.toArray(defaultRendering.props.children),
        // The store's bytes, not viewerData: pdf.js empties the buffer the
        // viewer is given, so printing that would print an empty file
        !kendoPrint && <ToolbarPrint key='print' document={document} />,
        <ToolbarAttachments key='attachment' />,
      );
    },
    [isLoading, document, kendoPrint, page, total, goToPage],
  );

  // prevent confusion from back2back loaders when pdfviewer loading pdf from memory
  // progress bar loads pdf to client -> this loads from client memory to pdfViewer so it never takes
  // longer than a second or two at most since we already have the bytearray
  //
  // How: whenever the viewer would show its spinner, Kendo calls this with
  // that spinner (`loader`) and shows what it returns instead. A spinner gives
  // back <></> and null gives back null, so either way nothing shows.
  const renderLoader = useCallback((loader: React.ReactElement<unknown> | null) => {
    return loader && <></>;
  }, []);

  // After every hook: the same hooks must run on every render
  if (!viewerData) return <div />;

  return (
    <>
      {isDocumentLoading || isLoading ? (
        <div style={{ height: '100vh' }} className='k-d-flex k-justify-content-center k-align-items-center'>
          <ProgressBar style={{ width: '50%' }} value={progress} label={props => `${props.value}%`} animation={false} min={0} max={100} progressStyle={{ backgroundColor: 'green' }} />
        </div>
      ) : (
        <PDFViewer
          ref={viewerRef}
          arrayBuffer={viewerData?.buffer ?? undefined}
          style={{ height: '100%' }}
          tools={tools}
          // zoom goes IN: the level Kendo shows (1 = 100%); Kendo never changes
          // it by itself. onZoom comes OUT: on + / − or a picked level, Kendo
          // calls it with the new one. Like value + onChange on an <input>:
          //   click + → onZoom({ zoom: 1.25 }) → handleZoom: setZoom(1.25)
          //           → re-render, zoom={1.25} goes back in → Kendo shows 125%
          // We own the number so fitToWidth can set it too (after load, on resize).
          // Kendo's API docs list onZoom under Events: "Fires when the zoom has
          // changed." Its event's .zoom is the new level.
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

// ── How the PDF's bytes reach the viewer: viewerData and arrayBuffer ──
//
// Copying the bytes (viewerData). Passing an existing Uint8Array to
// new Uint8Array(…) makes a copy: new bytes, same contents.
//
//   new Uint8Array(document)          copy
//   document.slice()                  copy
//   Uint8Array.from(document)         copy
//   new Uint8Array(document.buffer)   NOT a copy: a new view over the SAME
//                                     bytes, so emptying one empties both‼️
//
// Pass the array, get a copy; pass its .buffer, get shared memory. The copy
// matters because pdf.js empties what it is given, and Print needs the store's
// original intact.
//
// Which PDF to show (arrayBuffer). Kendo's PDFViewer takes the PDF one of four
// ways; pick one:
//
//   url           a web address; Kendo downloads it
//   data          the PDF as base64 text
//   arrayBuffer   the raw bytes, as an ArrayBuffer   ← used here
//   typedArray    the raw bytes, as a Uint8Array
//
// An ArrayBuffer is the raw block of memory underneath a Uint8Array; the
// Uint8Array is a view onto it, and .buffer gets the block itself. So
// arrayBuffer={viewerData?.buffer} hands Kendo the memory behind the viewer's
// own copy: no second download, and pdf.js can empty it without touching the
// store's original.
//
// Side note: typedArray={viewerData} would do the same with less code, and
// `?? undefined` changes nothing (?. already gives undefined when there is no
// viewerData). Both are fine to leave.
