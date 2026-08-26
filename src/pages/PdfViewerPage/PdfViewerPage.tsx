import { useCallback } from 'react';
import Layout from '../../components/Layout';
import PdfViewer from '../../components/PdfViewer';
import PdfDetails from '../../components/PdfDetails';
import { usePdfViewer, useDetailsPanel } from '../../hooks';

export default function PdfViewerPage() {
  const {
    allCases,
    hasMultipleCases,
    metadata,
    selectedCaseId,
    selectCase,
    showStamp,
    toggleStamp,
    activePdfPath,
  } = usePdfViewer();
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
      <PdfViewer filePath={activePdfPath} />
      <PdfDetails
        metadata={metadata}
        showStamp={showStamp}
        onToggleStamp={toggleStamp}
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
