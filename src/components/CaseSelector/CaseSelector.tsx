import { useState, useRef, useEffect } from 'react';
import type { PdfMetadata } from '../../types';
import './CaseSelector.css';

interface CaseSelectorProps {
  cases: PdfMetadata[];
  selectedCaseId: string;
  onSelectCase: (caseId: string) => void;
}

/**
 * Custom dropdown for choosing a case number. Replaces the native <select>
 * so we can control the position — the options list always opens downward
 * and stays anchored below the trigger button.
 *
 * Includes an info icon (ⓘ) with a hover tooltip explaining that
 * selecting a new case number will refresh all document details.
 */
export default function CaseSelector({
  cases,
  selectedCaseId,
  onSelectCase,
}: CaseSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Find the currently selected case to display its case number
  const selectedCase = cases.find((c) => c.id === selectedCaseId);

  // Close the dropdown when clicking outside of it.
  // We attach a click listener to the whole document and check
  // if the click target is inside our dropdown — if not, close it.
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = (caseId: string) => {
    onSelectCase(caseId);
    setIsOpen(false);
  };

  return (
    <div className="case-selector">
      <div className="case-selector-header">
        <h3>Case Number</h3>
        {/* Info icon with a CSS-only tooltip on hover.
            The \u24D8 character is ⓘ (circled lowercase i). */}
        <span className="case-selector-info" aria-label="Selecting a new case number will refresh all document details">
          {'\u24D8'}
          <span className="case-selector-tooltip">
            Selecting a new case number will refresh all document details
          </span>
        </span>
      </div>

      {/* Custom dropdown — the ref wraps everything so the
          "click outside to close" logic can detect boundaries. */}
      <div className="case-dropdown" ref={dropdownRef}>
        <button
          className="case-dropdown-trigger"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span>{selectedCase?.caseNumber ?? 'Select a case'}</span>
          {/* \u25BE = ▾ small down triangle */}
          <span className="case-dropdown-arrow">{'\u25BE'}</span>
        </button>

        {isOpen && (
          <ul className="case-dropdown-list" role="listbox">
            {cases.map((c) => (
              <li
                key={c.id}
                className={`case-dropdown-option ${c.id === selectedCaseId ? 'case-dropdown-option--selected' : ''}`}
                role="option"
                aria-selected={c.id === selectedCaseId}
                onClick={() => handleSelect(c.id)}
              >
                {c.caseNumber}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
