interface ViewerPageProps {
  cases: { caseNumber?: string }[] | null;
  documentId?: string;
  documentData?: DocumentDetailsData | null;
  onCaseChange: (caseNumber: string) => void;
  onToggleStamp: (stamp: boolean) => void;
}

interface DocDetailItemProps extends DrawerItemProps {
  id?: string;
  attachments?: AttachmentInfo[];
  cases?: { caseNumber?: string }[] | null;
  data?: DocumentDetailsData | null;
  onCaseChange?: DocumentDetailsPanelProps['onCaseChange'];
  onToggleStamp?: DocumentDetailsPanelProps['onToggleStamp'];
  readAttachment?: ReadAttachment;
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
import type { DocumentDetailsData, DocumentDetailsPanelProps } from './components/DocumentDetails';
import type { AttachmentInfo, ReadAttachment } from './hooks/useAttachments';
import { useViewerDocument } from './hooks/useViewerDocument';

// Renders one document-details entry inside the Kendo drawer.
const DocDetailItem = ({
  attachments,
  cases,
  data,
  onCaseChange,
  onToggleStamp,
  readAttachment,
}: DocDetailItemProps) => {
  return (
    <DocumentDetailsPanel
      attachments={attachments ?? []}
      cases={cases}
      {...data}
      onCaseChange={(details) => onCaseChange?.(details)}
      onToggleStamp={(b) => onToggleStamp?.(b)}
      readAttachment={readAttachment ?? (() => null)}
    />
  );
};

// Renders the responsive document viewer page.
export function ViewerPage({
  cases,
  documentId,
  documentData,
  onCaseChange,
  onToggleStamp,
}: ViewerPageProps) {
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);

  const isMobile = useMediaQuery('(max-width: 768px)');

  const { notification, dismissNotification } = useNotification();

  const { attachments, onDocumentLoad, readAttachment } = useViewerDocument(documentData?.url);

  const docketTitle = documentData?.docketText || '<Docket Text Here>';

  return (
    <main>
      <AppBar>
        <AppBarSection>
          {/* TODO: Re-Enable DocumentFeeButton when its in scope */}
          {/* <AppBarSection>
            <DocumentFeeButton amount={0.1} />
          </AppBarSection> */}
          <AppBarSpacer style={{ width: 15 }} />
          <h3>{docketTitle}</h3>
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
            cases: cases,
            data: documentData,
            onCaseChange: onCaseChange,
            onToggleStamp: onToggleStamp,
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
