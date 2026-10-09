export interface DocumentDetailsData {
  caseNumber?: string;
  caseName?: string;
  caseStampToggle?: boolean;
  restrictionStatus?: string;
  filedBy?: string;
  filedDate?: string;
  fileSize?: string | number;
  docketText?: string;
  url?: string;
}

export interface DocumentDetailsPanelProps extends DocumentDetailsData {
  cases?: { caseNumber?: string }[] | null;
  onCaseChange: (caseNumber: string) => void;
  onToggleStamp: (stamp: boolean) => void;
  attachments: AttachmentInfo[];
  readAttachment: ReadAttachment;
}

import { useCallback } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  GridLayout,
  GridLayoutItem,
  Label,
  RadioGroup,
} from '@progress/kendo-react-all';
import CaseNumber from './CaseNumber';
import { AttachmentIndicator } from './AttachmentIndicator';
import type { AttachmentInfo, ReadAttachment } from '../hooks/useAttachments';

const CaseStamp = (_props: {
  displayCaseStamp?: boolean;
  setDisplayCaseStamp: (stamp: boolean) => void;
}) => {
  const { displayCaseStamp, setDisplayCaseStamp } = _props;

  const caseStampOptions = [
    { label: 'Include Case Stamp', value: 'display' },
    { label: 'Do not include Case Stamp', value: 'hide' },
  ];

  const handleChange = useCallback(
    (e: { value: string }) => {
      setDisplayCaseStamp(e.value === 'display');
    },
    [setDisplayCaseStamp],
  );

  return (
    <div id="caseStampRadio">
      <Label id="case-stamp">
        <strong>Case Stamp</strong>
      </Label>
      <RadioGroup
        ariaLabelledBy="case-stamp"
        name="caseStampInput"
        data={caseStampOptions}
        value={displayCaseStamp ? 'display' : 'hide'}
        onChange={handleChange}
        layout="vertical"
      />
    </div>
  );
};

export function DocumentDetailsPanel({
  attachments,
  cases,
  caseNumber,
  caseName,
  caseStampToggle,
  restrictionStatus,
  filedBy,
  filedDate,
  fileSize,
  docketText,
  onCaseChange,
  onToggleStamp,
  readAttachment,
}: DocumentDetailsPanelProps) {
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
                selectedCaseNumber={caseNumber || null}
                onSelectCase={onCaseChange}
              />
            </GridLayoutItem>

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

            <GridLayoutItem colSpan={2}>
              <AttachmentIndicator attachments={attachments} readAttachment={readAttachment} />
            </GridLayoutItem>
          </GridLayout>
        </CardBody>
      </Card>
    </div>
  );
}
