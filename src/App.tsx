import { useCallback, useState } from 'react';
import Layout from './components/Layout';
import ThumbnailSidebar from './components/ThumbnailSidebar';
import PdfViewer from './components/PdfViewer';
import PdfDetails from './components/PdfDetails';
import pdfMetadata from './data/pdf-metadata.json';
import './App.css';

function App() {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const metadata = pdfMetadata[0];

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleLoadSuccess = useCallback((numPages: number) => {
    setTotalPages(numPages);
  }, []);

  return (
    <Layout>
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
