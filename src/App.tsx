import Layout from './components/Layout';
import PdfViewer from './components/PdfViewer';
import PdfDetails from './components/PdfDetails';
import { usePdfViewer } from './hooks';
import './App.css';

function App() {
  const { metadata } = usePdfViewer();

  return (
    <Layout title={metadata.title}>
      <PdfViewer filePath={metadata.filePath} />
      <PdfDetails metadata={metadata} />
    </Layout>
  );
}

export default App;
