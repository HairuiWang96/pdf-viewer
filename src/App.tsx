import Layout from './components/Layout';
import ThumbnailSidebar from './components/ThumbnailSidebar';
import PdfViewer from './components/PdfViewer';
import PdfDetails from './components/PdfDetails';
import { usePdfViewer } from './hooks';
import './App.css';

function App() {
  const {
    currentPage,
    totalPages,
    metadata,
    handlePageChange,
    handleLoadSuccess,
  } = usePdfViewer();

  return (
    <Layout title={metadata.title}>
      <ThumbnailSidebar
        filePath={metadata.filePath}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />
      <PdfViewer
        filePath={metadata.filePath}
        currentPage={currentPage}
        onPageChange={handlePageChange}
        onLoadSuccess={handleLoadSuccess}
      />
      <PdfDetails
        metadata={metadata}
        currentPage={currentPage}
      />
    </Layout>
  );
}

export default App;
