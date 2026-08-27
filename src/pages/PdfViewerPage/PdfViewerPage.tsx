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

  const { isDetailsOpen, isMobile, toggleDetails, closeDetails } = useDetailsPanel();

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
    >
      <ThumbnailSidebar
        filePath={activePdfPath}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />
      <PdfViewer
        filePath={activePdfPath}
        currentPage={currentPage}
        onPageChange={handlePageChange}
        onLoadSuccess={handleLoadSuccess}
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
