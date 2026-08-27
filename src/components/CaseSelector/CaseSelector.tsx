import { useState, useRef, useEffect, useCallback } from 'react';
import type { PdfMetadata } from '../../types';
import './CaseSelector.css';

interface CaseSelectorProps {
  cases: PdfMetadata[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string) => void;
}

/**
 * Custom dropdown for choosing a case number. Replaces the native <select>
 * so we can control the position — the options list always opens downward
 * and stays anchored below the trigger button.
 *
 * Keyboard support (Section 508 / WCAG 2.1.1):
 *   - Enter / Space on trigger → open/close dropdown
 *   - Arrow Down / Arrow Up → move through options
 *   - Enter on an option → select it and close
 *   - Escape → close without selecting
 *   - Tab out → close dropdown
 *
 * Includes an info icon (ⓘ) with a hover/focus tooltip explaining that
 * selecting a new case number will refresh all document details.
 */
export default function CaseSelector({
  cases,
  selectedCaseId,
  onSelectCase,
}: CaseSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  // Tracks which option is visually focused via arrow keys (not the same
  // as the selected option — you can arrow through without selecting).
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const infoRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

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

  // When the dropdown opens, set the initial focused index to the
  // currently selected option so arrow keys start from a sensible place.
  // When it closes, reset so the next open starts fresh.
  useEffect(() => {
    if (isOpen) {
      const idx = cases.findIndex((c) => c.id === selectedCaseId);
      setFocusedIndex(idx >= 0 ? idx : 0);
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, cases, selectedCaseId]);

  // Scroll the focused option into view within the list container
  // so it's always visible when navigating via keyboard.
  useEffect(() => {
    if (!isOpen || focusedIndex < 0 || !listRef.current) return;
    const options = listRef.current.querySelectorAll('[role="option"]');
    options[focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, focusedIndex]);

  const handleSelect = useCallback((caseId: string) => {
    onSelectCase(caseId);
    setIsOpen(false);
    // Return focus to the trigger button after selection so
    // keyboard users aren't stranded in the closed list.
    triggerRef.current?.focus();
  }, [onSelectCase]);

  // Keyboard handler for the trigger button — opens/closes the dropdown
  // and delegates arrow-key navigation when open.
  const handleTriggerKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        setIsOpen((prev) => !prev);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) setIsOpen(true);
        break;
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
        }
        break;
    }
  }, [isOpen]);

  // Keyboard handler for the options list — arrow navigation,
  // selection with Enter, and closing with Escape.
  const handleListKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, cases.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < cases.length) {
          handleSelect(cases[focusedIndex].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        // Let the default Tab behavior move focus away,
        // but close the dropdown so it doesn't float orphaned.
        setIsOpen(false);
        break;
    }
  }, [cases, focusedIndex, handleSelect]);

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
    <div className="case-selector">
      <div className="case-selector-header">
        <h3>Case Number</h3>
        {/* Info icon with tooltip on hover AND focus. Uses position: fixed so the
            tooltip escapes the sidebar's overflow clipping and renders
            above the PDF. We calculate position from the icon's bounding rect. */}
        <span
          className="case-selector-info"
          ref={infoRef}
          tabIndex={0}
          role="note"
          aria-label="Selecting a new case number will refresh all document details"
          onMouseEnter={updateTooltipPosition}
          onFocus={updateTooltipPosition}
        >
          {'\u24D8'}
          <span className="case-selector-tooltip" style={tooltipStyle}>
            Selecting a new case number will refresh all document details
          </span>
        </span>
      </div>

      {/* Custom dropdown — the ref wraps everything so the
          "click outside to close" logic can detect boundaries. */}
      <div className="case-dropdown" ref={dropdownRef}>
        <button
          className="case-dropdown-trigger"
          ref={triggerRef}
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={handleTriggerKeyDown}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label="Select case number"
        >
          <span className={selectedCase ? '' : 'case-dropdown-placeholder'}>
            {selectedCase?.caseNumber ?? 'Please select a case number'}
          </span>
          {/* \u25BE = ▾ small down triangle */}
          <span className="case-dropdown-arrow">{'\u25BE'}</span>
        </button>

        {isOpen && (
          <ul
            className="case-dropdown-list"
            role="listbox"
            ref={listRef}
            tabIndex={0}
            onKeyDown={handleListKeyDown}
            aria-activedescendant={
              focusedIndex >= 0 ? `case-option-${cases[focusedIndex].id}` : undefined
            }
          >
            {cases.map((c, i) => (
              <li
                key={c.id}
                id={`case-option-${c.id}`}
                className={`case-dropdown-option ${c.id === selectedCaseId ? 'case-dropdown-option--selected' : ''} ${i === focusedIndex ? 'case-dropdown-option--focused' : ''}`}
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
