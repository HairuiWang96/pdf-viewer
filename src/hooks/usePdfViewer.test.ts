import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import usePdfViewer from './usePdfViewer';
import { threeCases, makeCase } from '../test/fixtures';

/**
 * Tests for the hook that owns case selection and the stamp toggle.
 *
 * There is no DOM here at all — a hook is just a function, so these are the
 * cheapest and most valuable tests in the project.
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

      expect(result.current.hasMultipleCases).toBe(true);
      expect(result.current.selectedCaseId).toBeNull();
      expect(result.current.metadata).toBeNull();
    });

    it('still shows a PDF before anything is selected', () => {
      const { result } = renderHook(() => usePdfViewer());

      // The viewer pane should never be blank, so it falls back to case one.
      expect(result.current.activePdfPath).toBe('/q1-market-report.pdf');
    });

    it('defaults the stamp toggle to off', () => {
      const { result } = renderHook(() => usePdfViewer());

      expect(result.current.showStamp).toBe(false);
    });

    it('fills in metadata once a case is chosen', () => {
      const { result } = renderHook(() => usePdfViewer());

      // Every call that changes state goes inside act().
      act(() => result.current.selectCase('2'));

      expect(result.current.selectedCaseId).toBe('2');
      expect(result.current.metadata?.caseNumber).toBe('CASE-2026-002');
      expect(result.current.activePdfPath).toBe('/q2-market-report.pdf');
    });

    it('resets the stamp toggle when the case changes', () => {
      const { result } = renderHook(() => usePdfViewer());

      act(() => result.current.selectCase('2'));
      act(() => result.current.toggleStamp(true));
      expect(result.current.showStamp).toBe(true);

      // Switching case starts the user fresh, rather than silently carrying
      // a stamped view across to a different document.
      act(() => result.current.selectCase('3'));
      expect(result.current.showStamp).toBe(false);
    });

    it('serves the stamped file only while the stamp is on', () => {
      const { result } = renderHook(() => usePdfViewer());

      act(() => result.current.selectCase('1'));
      expect(result.current.activePdfPath).toBe('/q1-market-report.pdf');

      act(() => result.current.toggleStamp(true));
      expect(result.current.activePdfPath).toBe('/q1-market-report-stamped.pdf');

      act(() => result.current.toggleStamp(false));
      expect(result.current.activePdfPath).toBe('/q1-market-report.pdf');
    });

    it('treats an unknown case id as no selection', () => {
      const { result } = renderHook(() => usePdfViewer());

      act(() => result.current.selectCase('does-not-exist'));

      // metadata falls back to null rather than throwing, and the viewer
      // keeps showing the default file.
      expect(result.current.metadata).toBeNull();
      expect(result.current.activePdfPath).toBe('/q1-market-report.pdf');
    });

    it('exposes every case so the dropdown can list them', () => {
      const { result } = renderHook(() => usePdfViewer());

      expect(result.current.allCases).toHaveLength(3);
    });
  });

  describe('with a single case', () => {
    beforeEach(() => {
      setCases([makeCase()]);
    });

    it('auto-selects the only case, so no dropdown is needed', () => {
      const { result } = renderHook(() => usePdfViewer());

      expect(result.current.hasMultipleCases).toBe(false);
      expect(result.current.selectedCaseId).toBe('1');
      expect(result.current.metadata?.caseNumber).toBe('CASE-2026-001');
    });

    it('defaults the stamp toggle to on', () => {
      const { result } = renderHook(() => usePdfViewer());

      // Opposite of the multi-case default: with one document there is
      // nothing to choose, so it opens on the stamped copy.
      expect(result.current.showStamp).toBe(true);
      expect(result.current.activePdfPath).toBe('/q1-market-report-stamped.pdf');
    });
  });
});
