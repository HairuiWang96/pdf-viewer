import Layout from './components/Layout';
import PdfViewer from './components/PdfViewer';
import PdfDetails from './components/PdfDetails';
import { usePdfViewer, useDetailsPanel } from './hooks';
import './App.css';

function App() {
  const { metadata, showStamp, toggleStamp, activePdfPath } = usePdfViewer();
  const { isDetailsOpen, isMobile, toggleDetails, closeDetails } = useDetailsPanel();

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
      />
    </Layout>
  );
}

export default App;
