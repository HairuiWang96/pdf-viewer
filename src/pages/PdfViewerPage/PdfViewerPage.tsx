import { useCallback } from 'react';
import Layout from '../../components/Layout';
import ThumbnailSidebar from '../../components/ThumbnailSidebar';
import PdfViewer from '../../components/PdfViewer';
import PdfDetails from '../../components/PdfDetails';
import { usePdfViewer, usePdfStamp, useDetailsPanel } from '../../hooks';

export default function PdfViewerPage() {
  const {
    allCases,
    hasMultipleCases,
    metadata,
    selectedCaseId,
    selectCase,
    currentPage,
    totalPages,
    handlePageChange,
    handleLoadSuccess,
  } = usePdfViewer();

  const { showStamp, toggleStamp, activePdfPath } = usePdfStamp(
    metadata.filePath,
    metadata.stampText,
  );

  const {
    isDetailsOpen,
    isThumbnailsOpen,
    isMobile,
    toggleDetails,
    closeDetails,
    toggleThumbnails,
    closeThumbnails,
  } = useDetailsPanel();

  // On mobile, selecting a case should also close the details panel
  // so the user sees the PDF with the newly selected case.
  const handleSelectCase = useCallback((caseId: string) => {
    selectCase(caseId);
    if (isMobile) closeDetails();
  }, [selectCase, isMobile, closeDetails]);

  return (
    <Layout
      title={metadata.title}
      isMobile={isMobile}
      isDetailsOpen={isDetailsOpen}
      onToggleDetails={toggleDetails}
      isThumbnailsOpen={isThumbnailsOpen}
      onToggleThumbnails={toggleThumbnails}
    >
      <ThumbnailSidebar
        filePath={activePdfPath}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        isMobile={isMobile}
        isOpen={isThumbnailsOpen}
        onClose={closeThumbnails}
      />
      <PdfViewer
        filePath={activePdfPath}
        currentPage={currentPage}
        onPageChange={handlePageChange}
        onLoadSuccess={handleLoadSuccess}
        isMobile={isMobile}
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
      />
    </Layout>
  );
}
