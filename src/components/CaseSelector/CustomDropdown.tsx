import { useState, useRef, useEffect, useCallback } from 'react';
import type { PdfMetadata } from '../../types';
import './CustomDropdown.css';

interface CustomDropdownProps {
  cases: PdfMetadata[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string) => void;
}

/**
 * Solution 1: Fully custom-built dropdown.
 *
 * Pros:
 *   - No external dependencies or licenses
 *   - Full control over styling and behavior
 *   - Proper placeholder (not selectable)
 *   - Section 508 accessible (keyboard nav + ARIA)
 *
 * Cons:
 *   - ~150 lines of manual code for keyboard handling, focus management,
 *     ARIA attributes, and click-outside detection
 *   - More maintenance burden — every accessibility fix is on us
 */
export default function CustomDropdown({
  cases,
  selectedCaseId,
  onSelectCase,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedCase = cases.find((c) => c.id === selectedCaseId);

  // Close dropdown on outside click
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

  // When the dropdown opens, set focused index and move focus to the list
  // so arrow key events are captured by the list's onKeyDown handler.
  useEffect(() => {
    if (isOpen) {
      const idx = cases.findIndex((c) => c.id === selectedCaseId);
      setFocusedIndex(idx >= 0 ? idx : 0);
      // Small delay to let the list render before focusing it
      requestAnimationFrame(() => listRef.current?.focus());
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, cases, selectedCaseId]);

  // Scroll focused option into view
  useEffect(() => {
    if (!isOpen || focusedIndex < 0 || !listRef.current) return;
    const options = listRef.current.querySelectorAll('[role="option"]');
    options[focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, focusedIndex]);

  const handleSelect = useCallback((caseId: string) => {
    onSelectCase(caseId);
    setIsOpen(false);
    triggerRef.current?.focus();
  }, [onSelectCase]);

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
        setIsOpen(false);
        break;
    }
  }, [cases, focusedIndex, handleSelect]);

  return (
    <div className="custom-dropdown" ref={dropdownRef}>
      <button
        className="custom-dropdown-trigger"
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select case number"
      >
        <span className={selectedCase ? '' : 'custom-dropdown-placeholder'}>
          {selectedCase?.caseNumber ?? 'Please select a case number'}
        </span>
        <span className="custom-dropdown-arrow">{'\u25BE'}</span>
      </button>

      {isOpen && (
        <ul
          className="custom-dropdown-list"
          role="listbox"
          ref={listRef}
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          aria-activedescendant={
            focusedIndex >= 0 ? `custom-option-${cases[focusedIndex].id}` : undefined
          }
        >
          {cases.map((c, i) => (
            <li
              key={c.id}
              id={`custom-option-${c.id}`}
              className={`custom-dropdown-option ${c.id === selectedCaseId ? 'custom-dropdown-option--selected' : ''} ${i === focusedIndex ? 'custom-dropdown-option--focused' : ''}`}
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
  );
}
