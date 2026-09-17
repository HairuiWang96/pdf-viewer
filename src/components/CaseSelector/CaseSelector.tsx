import { useState, useRef, useCallback } from 'react';
import type { PdfMetadata } from '../../types';
import KendoDropDownList from './KendoDropDownList';
import './CaseSelector.css';

interface CaseSelectorProps {
    cases: PdfMetadata[];
    selectedCaseId: string | null;
    onSelectCase: (caseId: string) => void;
}

/**
 * The case-number picker: a heading, an ⓘ note, and the dropdown itself.
 *
 * This branch uses KendoReact's DropDownList (the free tier) and nothing else.
 * The hand-built dropdown and the premium ComboBox that once sat alongside it
 * for comparison are on kendo-react-all.
 */

export default function CaseSelector({ cases, selectedCaseId, onSelectCase }: CaseSelectorProps) {
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
    const infoRef = useRef<HTMLSpanElement>(null);

    // Position the tooltip relative to the info icon using fixed
    // positioning so it escapes the sidebar's overflow clipping.
    const updateTooltipPosition = useCallback(() => {
        if (!infoRef.current) return;
        const rect = infoRef.current.getBoundingClientRect();
        setTooltipStyle({
            top: rect.top + rect.height / 2,
            right: window.innerWidth - rect.left + 6,
            transform: 'translateY(-50%)',
        });
    }, []);

    return (
        <div className='case-selector'>
            <div className='case-selector-header'>
                <h3>Case Number</h3>
                <span className='case-selector-info' ref={infoRef} tabIndex={0} role='note' aria-label='Selecting a new case number will refresh all document details' onMouseEnter={updateTooltipPosition} onFocus={updateTooltipPosition}>
                    {'\u24D8'}
                    <span className='case-selector-tooltip' style={tooltipStyle}>
                        Selecting a new case number will refresh all document details
                    </span>
                </span>
            </div>

            <KendoDropDownList cases={cases} selectedCaseId={selectedCaseId} onSelectCase={onSelectCase} />
        </div>
    );
}
