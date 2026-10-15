// Practice copy of CaseStamp from the other project, which keeps it in its own
// file. Moved here unchanged from the inline copy in DocumentDetails.tsx.
import { useCallback } from 'react';
import { Label, RadioGroup } from '@progress/kendo-react-all';

export default function CaseStamp(_props: {
  displayCaseStamp?: boolean;
  setDisplayCaseStamp: (stamp: boolean) => void;
}) {
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
}
