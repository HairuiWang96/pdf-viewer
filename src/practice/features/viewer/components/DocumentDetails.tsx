// Practice copy of DocumentDetailsPanel from the other project, which reads
// everything from the viewer store, the attachments included.
//
// Added, so picking a case refreshes the details (to copy to the other project):
//   - onCaseChange is the store's selectCase (sets the number and swaps in
//     that case's details) instead of setCurrentCaseNumber (number only)
//   - the fields show only once the details are for the selected case
//   - an "unavailable" message when the case's details are missing
export type { DocumentDetailsData } from '../types/document';

import {
  Card,
  CardBody,
  CardHeader,
  GridLayout,
  GridLayoutItem,
  Label,
} from '@progress/kendo-react-all';
import CaseNumber from './CaseNumber';
import CaseStamp from './CaseStamp';
import { AttachmentIndicator } from './AttachmentIndicator';
import { useViewerStore } from '../data/viewerStore';

export function DocumentDetailsPanel() {
  const details = useViewerStore((state) => state.details);
  const { caseName, restrictionStatus, filedBy, filedDate, fileSize, docketText } =
    details ?? {};

  const currentCaseNumber = useViewerStore((state) => state.currentCaseNumber);

  const cases = useViewerStore((state) => state.cases);
  const onCaseChange = useViewerStore((state) => state.selectCase);
  const caseError = useViewerStore((state) => state.caseError);

  const caseStampToggle = useViewerStore((state) => state.caseStampToggle);
  const onToggleStamp = useViewerStore((state) => state.setCaseStampToggle);

  // Show the fields only once the loaded details are for the selected case:
  //   one case    → pre-selected, details already match → shown
  //   several     → nothing picked yet → hidden
  //   just picked → details are still the old case's → hidden until loaded
  const showDetails = !!currentCaseNumber && details?.caseNumber === currentCaseNumber;

  return (
    <div>
      <Card>
        <CardHeader>
          <strong>Document Details</strong>
        </CardHeader>

        <CardBody>
          <GridLayout
            cols={[{ width: '120px' }, { width: '1fr' }]}
            gap={{
              rows: 12,
              cols: 16,
            }}
          >
            <GridLayoutItem colSpan={2}>
              <CaseNumber
                cases={cases}
                selectedCaseNumber={currentCaseNumber || null}
                onSelectCase={onCaseChange}
              />
            </GridLayoutItem>

            {caseError && (
              <GridLayoutItem colSpan={2}>
                <p role="alert">{caseError}</p>
              </GridLayoutItem>
            )}

            {showDetails && (
              <>
                <Label>
                  <strong>Case</strong>
                </Label>
                <span>{caseName}</span>

                <GridLayoutItem colSpan={2}>
                  <CaseStamp displayCaseStamp={caseStampToggle} setDisplayCaseStamp={onToggleStamp} />
                </GridLayoutItem>

                <Label>
                  <strong>Size</strong>
                </Label>
                <span>{restrictionStatus}</span>

                <Label>
                  <strong>Filed By</strong>
                </Label>
                <span>{filedBy}</span>

                <Label>
                  <strong>Filed Date</strong>
                </Label>
                <span>{filedDate}</span>

                <Label>
                  <strong>File Size</strong>
                </Label>
                <span>{fileSize}</span>

                <Label>
                  <strong>Docket Text</strong>
                </Label>
                <span>{docketText}</span>
              </>
            )}

            {/* The PDF's attachments: the same for every case, always shown */}
            <GridLayoutItem colSpan={2}>
              <AttachmentIndicator />
            </GridLayoutItem>
          </GridLayout>
        </CardBody>
      </Card>
    </div>
  );
}
