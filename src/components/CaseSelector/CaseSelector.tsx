import { useState, useRef, useCallback } from 'react';
import type { PdfMetadata } from '../../types';
import CustomDropdown from './CustomDropdown';
import KendoDropDownList from './KendoDropDownList';
import KendoComboBox from './KendoComboBox';
import './CaseSelector.css';

interface CaseSelectorProps {
    cases: PdfMetadata[];
    selectedCaseId: string | null;
    onSelectCase: (caseId: string) => void;
}

/**
 * Three dropdown implementations for comparison:
 *
 *   1. "custom"    — Hand-built dropdown (~150 lines). No dependencies.
 *                    Proper placeholder, full keyboard/ARIA support.
 *
 *   2. "dropdown"  — KendoReact DropDownList (free). ~30 lines.
 *                    Placeholder is a selectable item (defaultItem limitation).
 *
 *   3. "combobox"  — KendoReact ComboBox (premium license). ~30 lines.
 *                    Proper placeholder, but allows typing in the input.
 *
 * Change the ACTIVE_VARIANT constant below to switch between them.
 */
const ACTIVE_VARIANT: 'custom' | 'dropdown' | 'combobox' = 'dropdown';

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

            {ACTIVE_VARIANT === 'custom' && <CustomDropdown cases={cases} selectedCaseId={selectedCaseId} onSelectCase={onSelectCase} />}

            {ACTIVE_VARIANT === 'dropdown' && <KendoDropDownList cases={cases} selectedCaseId={selectedCaseId} onSelectCase={onSelectCase} />}

            {ACTIVE_VARIANT === 'combobox' && <KendoComboBox cases={cases} selectedCaseId={selectedCaseId} onSelectCase={onSelectCase} />}
        </div>
    );
}
