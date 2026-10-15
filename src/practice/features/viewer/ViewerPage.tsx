// Case changes and the stamp toggle now go through the viewer store (see
// DocumentDetails), so this page only hands the store its starting data.
interface ViewerPageProps {
  cases: { caseNumber?: string }[] | null;
  documentId?: string;
  documentData?: DocumentDetailsData | null;
}

interface DocDetailItemProps extends DrawerItemProps {
  id?: string;
  attachments?: AttachmentInfo[];
  readAttachment?: ReadAttachment;
}

import { useEffect, useState } from 'react';
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
import type { DocumentDetailsData } from './components/DocumentDetails';
import type { AttachmentInfo, ReadAttachment } from './types/attachments';
import { useViewerDocument } from './hooks/useViewerDocument';
import { initializeViewer } from './data/viewerStore';
import '../../app/global.css';

// Renders one document-details entry inside the Kendo drawer. The details
// themselves come from the store.
const DocDetailItem = ({ attachments, readAttachment }: DocDetailItemProps) => {
  return (
    <DocumentDetailsPanel
      attachments={attachments ?? []}
      readAttachment={readAttachment ?? (() => null)}
    />
  );
};

// Renders the responsive document viewer page.
export function ViewerPage({ cases, documentId, documentData }: ViewerPageProps) {
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);

  // Fill the store from the page's data: the cases, and the first details
  useEffect(() => {
    initializeViewer(cases ?? [], documentData ?? {});
  }, [cases, documentData]);

  // A narrow screen, or a phone turned sideways: wider than 768 px but short,
  // and touch-driven. `pointer: coarse` keeps a short desktop window, driven
  // by a mouse, on the desktop layout. Same rule as the main viewer's
  // MOBILE_LAYOUT_QUERY.
  const isMobile = useMediaQuery('(max-width: 768px), (max-height: 500px) and (pointer: coarse)');

  const { notification, dismissNotification } = useNotification();

  const { attachments, onDocumentLoad, readAttachment } = useViewerDocument(documentData?.url);

  const docketTitle = documentData?.docketText || '<Docket Text Here>';

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
        items={[
          {
            id: documentId,
            attachments,
            readAttachment,
          },
        ]}
        item={DocDetailItem}
        mode="push"
        position="end"
      >
        <DrawerContent>
          <PDFDocViewer
            url={documentData?.url}
            isMobile={isMobile}
            onDocumentLoad={onDocumentLoad}
            attachments={attachments}
            readAttachment={readAttachment}
          />
        </DrawerContent>
      </Drawer>
    </main>
  );
}
