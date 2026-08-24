import Layout from './components/Layout';
import ThumbnailSidebar from './components/ThumbnailSidebar';
import PdfViewer from './components/PdfViewer';
import PdfDetails from './components/PdfDetails';
import { usePdfViewer, usePdfStamp } from './hooks';
import './App.css';

function App() {
  const {
    currentPage,
    totalPages,
    metadata,
    handlePageChange,
    handleLoadSuccess,
  } = usePdfViewer();

  const { showStamp, toggleStamp, activePdfPath } = usePdfStamp(
    metadata.filePath,
    metadata.stampText,
  );

  return (
    <Layout title={metadata.title}>
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
      />
    </Layout>
  );
}

export default App;
