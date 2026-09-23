import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import usePdfViewer from './usePdfViewer';
import { threeCases, makeCase } from '../test/fixtures';

/**
 * Tests for the hook that owns case selection and page navigation.
 *
 * There is no DOM here at all — a hook is just a function, so these are the
 * cheapest and most valuable tests in the project.
 *
 * Note this branch splits responsibilities differently from the iframe
 * branch: stamping lives in usePdfStamp, so this hook is only about which
 * case is selected and where the reader is in the document.
 *
 * ── Two testing-library helpers are doing the work ──
 *
 * renderHook(fn)  Runs a hook inside a throwaway component and hands back
 *                 `result.current`, which is whatever the hook returned.
 *
 * act(fn)         Wraps anything that causes a state update. React batches
 *                 state changes; `act` tells it "apply them now, before I
 *                 assert". Forget it and you assert against stale values.
 */

/**
 * The hook reads its case list straight from a JSON import, so the only way to
 * test the single-case path is to stand in for that module.
 *
 * `vi.hoisted` matters here: vi.mock calls are lifted to the top of the file,
 * above the imports, so a plain `const` declared below would not exist yet when
 * the mock factory runs. vi.hoisted lifts our array up with it.
 */
const { mockCases } = vi.hoisted(() => ({ mockCases: [] as unknown[] }));

vi.mock('../data/pdf-metadata.json', () => ({ default: mockCases }));

/**
 * Refill the array *in place* with splice rather than reassigning it.
 * The hook holds a reference to this exact array; pointing our variable at a
 * new array would leave the hook looking at the old one.
 */
function setCases(cases: unknown[]) {
  mockCases.splice(0, mockCases.length, ...cases);
}

describe('usePdfViewer', () => {
  describe('with multiple cases', () => {
    beforeEach(() => {
      setCases(threeCases);
    });

    it('starts with nothing selected, so the dropdown shows its placeholder', () => {
      const { result } = renderHook(() => usePdfViewer());

      expect(result.current.selectedCaseId).toBeNull();
      expect(result.current.hasMultipleCases).toBe(true);
    });

    it('hides document details until a case is chosen', () => {
      const { result } = renderHook(() => usePdfViewer());

      // PdfDetails keys off metadata being null to stay hidden.
      expect(result.current.metadata).toBeNull();
    });

    it('still shows a PDF before anything is selected', () => {
      const { result } = renderHook(() => usePdfViewer());

      // Falls back to the first case so the viewer is never empty.
      expect(result.current.filePath).toBe('/q1-market-report.pdf');
      expect(result.current.fileName).toBe('q1-market-report.pdf');
    });

    it('fills in metadata and the file once a case is chosen', () => {
      const { result } = renderHook(() => usePdfViewer());

      act(() => result.current.selectCase('2'));

      expect(result.current.selectedCaseId).toBe('2');
      expect(result.current.metadata?.caseNumber).toBe('CASE-2026-002');
      expect(result.current.filePath).toBe('/q2-market-report.pdf');
    });

    it('treats an unknown case id as no selection', () => {
      const { result } = renderHook(() => usePdfViewer());

      act(() => result.current.selectCase('does-not-exist'));

      // The id is remembered, but nothing matches it, so details stay hidden
      // instead of the component reading fields off undefined.
      expect(result.current.metadata).toBeNull();
      expect(result.current.filePath).toBe('/q1-market-report.pdf');
    });

    it('sends the reader back to page 1 when the case changes', () => {
      const { result } = renderHook(() => usePdfViewer());

      act(() => result.current.handlePageChange(4));
      expect(result.current.currentPage).toBe(4);

      act(() => result.current.selectCase('2'));

      // Landing on page 4 of a different document would be disorienting.
      expect(result.current.currentPage).toBe(1);
    });

    it('clears the page count when the case changes', () => {
      const { result } = renderHook(() => usePdfViewer());

      act(() => result.current.handleLoadSuccess(5));
      expect(result.current.totalPages).toBe(5);

      act(() => result.current.selectCase('2'));

      // Zero until the new document reports its own length, so the pager
      // never shows the previous document's count.
      expect(result.current.totalPages).toBe(0);
    });

    it('counts selections so the stamp toggle can tell a re-pick from a re-render', () => {
      const { result } = renderHook(() => usePdfViewer());

      expect(result.current.selectionCount).toBe(0);

      act(() => result.current.selectCase('2'));
      expect(result.current.selectionCount).toBe(1);

      // Same case again still counts — usePdfStamp needs to distinguish
      // "the user picked a case" from "the file happens to be unchanged".
      act(() => result.current.selectCase('2'));
      expect(result.current.selectionCount).toBe(2);
    });

    it('tracks the current page as the reader moves through the document', () => {
      const { result } = renderHook(() => usePdfViewer());

      expect(result.current.currentPage).toBe(1);

      act(() => result.current.handlePageChange(3));

      expect(result.current.currentPage).toBe(3);
    });
  });

  describe('with a single case', () => {
    beforeEach(() => {
      setCases([makeCase({ id: 'only', caseNumber: 'CASE-SOLO' })]);
    });

    it('auto-selects the only case, so there is nothing to pick', () => {
      const { result } = renderHook(() => usePdfViewer());

      expect(result.current.hasMultipleCases).toBe(false);
      expect(result.current.selectedCaseId).toBe('only');
    });

    it('shows document details immediately', () => {
      const { result } = renderHook(() => usePdfViewer());

      expect(result.current.metadata?.caseNumber).toBe('CASE-SOLO');
    });
  });
});
