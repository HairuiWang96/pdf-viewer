// Loads the document by id (useLoadViewerDocument runs the loader, which fills
// the viewer store), then reads everything from the store: the PDF's bytes,
// and the selected case's details (the panels read the attachments
// themselves). Needs a QueryClientProvider above it, for the loader's query.
interface ViewerPageProps {
  documentId?: string;
}

interface DocDetailItemProps extends DrawerItemProps {
  id?: string;
}

import { useState } from 'react';
import {
  AppBar,
  AppBarSection,
  AppBarSpacer,
  Button,
  Drawer,
  DrawerContent,
  DrawerItemProps,
  Notification,
  NotificationGroup,
} from '@progress/kendo-react-all';
import { menuIcon, xIcon } from '@progress/kendo-svg-icons';
import useMediaQuery from './hooks/useMediaQuery';
import useNotification from './hooks/useNotification';
import { DocumentDetailsPanel } from './components/DocumentDetails';
import PDFDocViewer from './components/PDFDocViewer';
import { useLoadViewerDocument } from './hooks/useLoadViewerDocument';
import { useViewerStore } from './data/viewerStore';
import '../../app/global.css';

// Renders one document-details entry inside the Kendo drawer. The details
// themselves come from the store.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DocDetailItem = (_props: DocDetailItemProps) => <DocumentDetailsPanel />;

// Renders the responsive document viewer page.
export function ViewerPage({ documentId }: ViewerPageProps) {
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);

  // Fetches the details and the PDF into the store
  useLoadViewerDocument(documentId);

  const document = useViewerStore((state) => state.document);
  const details = useViewerStore((state) => state.details);

  // A narrow screen, or a phone turned sideways: wider than 768 px but short,
  // and touch-driven. `pointer: coarse` keeps a short desktop window, driven
  // by a mouse, on the desktop layout. Same rule as the main viewer's
  // MOBILE_LAYOUT_QUERY.
  const isMobile = useMediaQuery('(max-width: 768px), (max-height: 500px) and (pointer: coarse)');

  const { notification, dismissNotification } = useNotification();

  const docketTitle = details?.docketText || '<Docket Text Here>';

  return (
    <main>
      {/* A long title stays on one line and ends in "…" (see global.css) */}
      <AppBar className="viewer-appbar">
        <AppBarSection className="viewer-title-section">
          {/* TODO: Re-Enable DocumentFeeButton when its in scope */}
          {/* <AppBarSection>
            <DocumentFeeButton amount={0.1} />
          </AppBarSection> */}
          <AppBarSpacer style={{ width: 15 }} />
          <h3 className="viewer-title" title={docketTitle}>
            {docketTitle}
          </h3>
        </AppBarSection>
        <AppBarSpacer style={{ marginRight: 105 }} />
        <AppBarSection>
          {isMobile ? (
            <Button
              svgIcon={showDetailsPanel ? xIcon : menuIcon}
              type="button"
              onClick={() => setShowDetailsPanel((value) => !value)}
              aria-expanded={showDetailsPanel}
            />
          ) : (
            <Button
              fillMode="outline"
              onClick={() => setShowDetailsPanel((value) => !value)}
              aria-expanded={showDetailsPanel}
            >
              {showDetailsPanel ? 'Hide Details' : 'Show Details'}
            </Button>
          )}
        </AppBarSection>
      </AppBar>
      {notification && (
        <NotificationGroup>
          <Notification
            type={{ style: notification.style, icon: true }}
            closable
            onClose={dismissNotification}
          >
            {notification.message}
          </Notification>
        </NotificationGroup>
      )}
      <Drawer
        animation={isMobile ? false : true}
        className="viewer-content"
        expanded={showDetailsPanel}
        items={[{ id: documentId }]}
        item={DocDetailItem}
        mode="push"
        position="end"
      >
        <DrawerContent>
          <PDFDocViewer document={document} isMobile={isMobile} />
        </DrawerContent>
      </Drawer>
    </main>
  );
}
