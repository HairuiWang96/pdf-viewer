// Practice copy of viewerStore from the other project. Only here to test
// against.
//
// Changed from the original imports:
//   - AttachmentInfo and ReadAttachment come from ../types/attachments, the
//     practice's stand-in for ../utils/extractAttachments
//   - the other types come from ../types/document, as the loader takes them
//
// In step with the other project as of 2026-10-15, plus documentId and
// startDocument, which its loader (api/loadViewerDocument) calls.
//
// Proposed, NOT in the other project yet (so picking a case refreshes the
// details):
//   - allDetails: every case's details, as fetchDocumentDetails returns them
//   - selectCase: looks the picked case up in allDetails and swaps its details
//     in, or sets caseError if they are missing
//   - initializeViewer takes allDetails, and pre-selects the document's own
//     case when there is no choice: the backend sends cases: [] for a
//     one-case document, so its number comes from details, not cases[0]
import { create } from 'zustand';
import { type AttachmentInfo, ReadAttachment } from '../types/attachments';
import type { CaseNumberOptions, DocumentDetailsData, PDFBytes } from '../types/document';

export type { PDFBytes };

// Everything that belongs to one document (the actions are below)
interface ViewerData {
  // which document this state belongs to
  documentId?: string | null;

  // backend owned data
  document?: PDFBytes | null;
  cases?: CaseNumberOptions[] | null;
  details?: DocumentDetailsData | null;
  allDetails: DocumentDetailsData[];
  stampedDocument?: PDFBytes | null;

  // client owned data
  // these two are a bit related if the case number changes the case stamp may need to be regenereated.
  // this why they exist in globla/app/page state not just in the component state.
  caseStampToggle?: boolean;
  currentCaseNumber?: string;

  documentLoaded: boolean;
  attachmentsLoaded: boolean;
  stampedDocumentLoaded: boolean;

  // client side that may move to backend
  attachments: AttachmentInfo[];
  attachmentReader?: Map<string, ReadAttachment> | null;

  // Set when the selected case's details are missing
  caseError: string | null;
}

interface ViewerState extends ViewerData {
  // actions
  startDocument: (id: string) => void;
  setCaseStampToggle: (toggle: boolean) => void;
  setCurrentCaseNumber: (caseNumber: string) => void;
  selectCase: (caseNumber: string) => void;
  setDocument: (document: PDFBytes) => void;
  setStampedDocument: (document: PDFBytes) => void;
  setAttachments: (
    attachments: AttachmentInfo[],
    attachmentReader: Map<string, ReadAttachment>,
  ) => void;
}

// One document's state before anything has loaded. startDocument resets to it.
const emptyDocument: ViewerData = {
  documentId: null,

  document: null,
  cases: null,
  details: null,
  allDetails: [],
  stampedDocument: null,

  attachments: [],
  attachmentReader: null,

  caseStampToggle: false,
  currentCaseNumber: undefined,

  documentLoaded: false,
  attachmentsLoaded: false,
  stampedDocumentLoaded: false,

  caseError: null,
};

export const useViewerStore = create<ViewerState>((set, get) => ({
  ...emptyDocument,

  // A new document: forget everything about the last one
  startDocument: (id) => set({ ...emptyDocument, documentId: id }),

  setCaseStampToggle: (toggle) => set({ caseStampToggle: toggle }),
  setCurrentCaseNumber: (caseNumber) => set({ currentCaseNumber: caseNumber }),

  // Picks a case. Every case's details are already in allDetails (the backend
  // sends them all at once), so this looks the picked one up and swaps it in.
  // The PDF is the same for every case, so the document and its attachments
  // are left alone.
  selectCase: (caseNumber) => {
    const details = get().allDetails.find((d) => d.caseNumber === caseNumber);
    if (!details) {
      set({
        currentCaseNumber: caseNumber,
        caseError: `Case ${caseNumber} is unavailable. Please try again or select another case.`,
      });
      return;
    }
    set({
      currentCaseNumber: caseNumber,
      details,
      caseStampToggle: details.caseStampToggle,
      caseError: null,
    });
  },
  setDocument: (document) => set({ documentLoaded: true, document }),
  setStampedDocument: (document) => set({ stampedDocumentLoaded: true, stampedDocument: document }),
  setAttachments: (attachments, attachmentReader) =>
    set({ attachmentsLoaded: true, attachments, attachmentReader }),
}));

export function initializeViewer(
  cases: CaseNumberOptions[],
  details: DocumentDetailsData,
  allDetails: DocumentDetailsData[] = [details],
) {
  useViewerStore.setState({
    cases,
    details,
    allDetails,
    caseStampToggle: details.caseStampToggle,
    // Several cases: the user picks one. Otherwise the backend sends no list
    // (cases: []) and the document's own case is the selected one.
    currentCaseNumber: cases.length > 1 ? undefined : details.caseNumber,
    caseError: null,
  });
}
