import { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PDFViewer, scrollToPage } from '@progress/kendo-react-all';
import '@progress/kendo-theme-default/dist/all.css';

/**
 * A bare KendoReact PDFViewer with none of the app's wrappers, so a failure
 * here is Kendo's own. Driven by query parameters:
 *   ?file=name.pdf   a file from ./public
 *   ?zoom=0.8        defaultZoom
 *   ?flex=1          wrap the viewer in a display:flex row (#2201)
 *   ?shrink=1        with flex, give the viewer no width, as the #2201 reporter did
 * and reports back to the Playwright checks through window.__loaded,
 * window.__error and window.__scrollTo.
 */
const q = new URLSearchParams(location.search);
const w = window as any;
const t0 = performance.now();

function App() {
  const ref = useRef<any>(null);
  w.__scrollTo = (n: number) => scrollToPage(ref.current.element, n - 1);
  const viewer = (
    <PDFViewer
      ref={ref}
      url={'/' + (q.get('file') ?? 'text-60.pdf')}
      style={q.get('shrink') ? { height: 500 } : { height: '100%', flex: q.get('flex') ? '1 1 auto' : undefined }}
      defaultZoom={q.get('zoom') ? Number(q.get('zoom')) : undefined}
      onLoad={() => { w.__loaded = { ms: Math.round(performance.now() - t0) }; }}
      onError={(e: any) => { w.__error = String(e.error?.message ?? e.error); }}
    />
  );
  return q.get('flex')
    ? <div style={{ display: 'flex', height: '100%' }}>{viewer}</div>
    : viewer;
}

createRoot(document.getElementById('root')!).render(<App />);
