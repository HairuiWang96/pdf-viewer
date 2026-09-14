import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import ThumbnailSidebar from '../../components/ThumbnailSidebar';
import KendoPdfViewer from '../../components/KendoPdfViewer';
import PdfDetails from '../../components/PdfDetails';
import { PlacementSwitcher, useAttachments, DEFAULT_PLACEMENT } from '../../components/PdfAttachments';
import type { AttachmentPlacement, AttachmentSource } from '../../components/PdfAttachments';
import { usePdfViewer, usePdfStamp, useDetailsPanel } from '../../hooks';

export default function PdfViewerPage() {
  const {
    allCases,
    hasMultipleCases,
    metadata,
    filePath,
    fileName,
    stampText,
    selectedCaseId,
    selectCase,
    selectionCount,
    currentPage,
    handlePageChange,
    handleLoadSuccess,
  } = usePdfViewer();

  // Single case → stamp on by default; multiple cases → off until chosen.
  const { showStamp, toggleStamp, activePdfPath } = usePdfStamp(filePath, stampText, {
    defaultOn: !hasMultipleCases,
    resetKey: selectionCount,
  });

  const {
    isDetailsOpen,
    isThumbnailsOpen,
    isMobile,
    toggleDetails,
    closeDetails,
    toggleThumbnails,
    closeThumbnails,
  } = useDetailsPanel();

  // ── Attachments ────────────────────────────────────────────────────────
  // The parsed document lives here rather than inside the viewer, because all
  // three indicator placements need the attachments and two of them are not
  // inside the viewer. useAttachments creates a blob URL per file, so it must
  // run exactly once — calling it per placement would make a fresh set each
  // time and leak every set but the last.
  const [pdfDocument, setPdfDocument] = useState<AttachmentSource | null>(null);
  const attachments = useAttachments(pdfDocument);
  const [placement, setPlacement] = useState<AttachmentPlacement>(DEFAULT_PLACEMENT);

  // Drop the previous document the moment the file changes, so the old file's
  // attachments are not briefly shown against the new one. The viewer reports
  // the new document once it has parsed it.
  useEffect(() => {
    setPdfDocument(null);
  }, [activePdfPath]);

  // On mobile, selecting a case should also close the details panel
  // so the user sees the PDF with the newly selected case.
  const handleSelectCase = useCallback((caseId: string) => {
    selectCase(caseId);
    if (isMobile) closeDetails();
  }, [selectCase, isMobile, closeDetails]);

  return (
    <Layout
      title={metadata?.title ?? 'PDF Viewer'}
      isMobile={isMobile}
      isDetailsOpen={isDetailsOpen}
      onToggleDetails={toggleDetails}
      isThumbnailsOpen={isThumbnailsOpen}
      onToggleThumbnails={toggleThumbnails}
      headerControl={<PlacementSwitcher placement={placement} onChange={setPlacement} />}
    >
      <ThumbnailSidebar
        filePath={activePdfPath}
        currentPage={currentPage}
        onPageChange={handlePageChange}
        isMobile={isMobile}
        isOpen={isThumbnailsOpen}
        onClose={closeThumbnails}
      />
      <KendoPdfViewer
        filePath={activePdfPath}
        fileName={fileName}
        currentPage={currentPage}
        onPageChange={handlePageChange}
        onLoadSuccess={handleLoadSuccess}
        onDocumentLoad={setPdfDocument}
        isMobile={isMobile}
        attachments={attachments}
        placement={placement}
      />
      <PdfDetails
        metadata={metadata}
        currentPage={currentPage}
        showStamp={showStamp}
        onToggleStamp={toggleStamp}
        downloadUrl={activePdfPath}
        isMobile={isMobile}
        isOpen={isDetailsOpen}
        onClose={closeDetails}
        allCases={allCases}
        hasMultipleCases={hasMultipleCases}
        selectedCaseId={selectedCaseId}
        onSelectCase={handleSelectCase}
        attachments={attachments}
        placement={placement}
      />
    </Layout>
  );
}
