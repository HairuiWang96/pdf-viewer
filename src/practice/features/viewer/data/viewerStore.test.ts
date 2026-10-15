import { describe, it, expect, beforeEach } from 'vitest';
import { useViewerStore, initializeViewer } from './viewerStore';
import type { DocumentDetailsData } from '../types/document';

/**
 * Tests for picking a case: what the store selects at the start, and how
 * selectCase swaps in the picked case's details from allDetails. The inputs
 * have the shape the other project's loader passes: cases is [] for a one-case
 * document, and allDetails holds every case's details.
 */

const firstDetails: DocumentDetailsData = { caseNumber: 'CASE-001', caseName: 'First v. Case' };
const secondDetails: DocumentDetailsData = {
  caseNumber: 'CASE-002',
  caseName: 'Second v. Case',
  caseStampToggle: true,
};
const twoCases = [{ caseNumber: 'CASE-001' }, { caseNumber: 'CASE-002' }];
const allDetails = [firstDetails, secondDetails];

describe('viewerStore', () => {
  beforeEach(() => {
    // Start each test from the store's first state
    useViewerStore.setState(useViewerStore.getInitialState(), true);
  });

  describe('initializeViewer', () => {
    it('selects the document’s own case when the backend sends no case list', () => {
      // The root cause of the missing single case number: for a one-case
      // document the backend sends cases: [], so cases[0] does not exist
      initializeViewer([], firstDetails, [firstDetails]);

      expect(useViewerStore.getState().currentCaseNumber).toBe('CASE-001');
    });

    it('selects nothing when there are several cases', () => {
      // The user has to pick one before any details show
      initializeViewer(twoCases, firstDetails, allDetails);

      expect(useViewerStore.getState().currentCaseNumber).toBeUndefined();
    });

    it('keeps every case’s details for selectCase to look up', () => {
      initializeViewer(twoCases, firstDetails, allDetails);

      expect(useViewerStore.getState().allDetails).toEqual(allDetails);
    });
  });

  describe('selectCase', () => {
    it('swaps in the picked case’s details', () => {
      initializeViewer(twoCases, firstDetails, allDetails);

      useViewerStore.getState().selectCase('CASE-002');

      expect(useViewerStore.getState().currentCaseNumber).toBe('CASE-002');
      expect(useViewerStore.getState().details).toEqual(secondDetails);
    });

    it("takes the stamp setting from the picked case's details", () => {
      initializeViewer(twoCases, firstDetails, allDetails);

      useViewerStore.getState().selectCase('CASE-002');

      expect(useViewerStore.getState().caseStampToggle).toBe(true);
    });

    it('reports the case as unavailable when its details are missing', () => {
      initializeViewer(twoCases, firstDetails, allDetails);

      useViewerStore.getState().selectCase('CASE-999');

      expect(useViewerStore.getState().caseError).toMatch(/CASE-999 is unavailable/);
      // The old case's details are left as they were; the panel hides them
      // because they no longer match the selected case
      expect(useViewerStore.getState().details).toEqual(firstDetails);
    });

    it('clears the message when another case is picked', () => {
      initializeViewer(twoCases, firstDetails, allDetails);

      useViewerStore.getState().selectCase('CASE-999');
      useViewerStore.getState().selectCase('CASE-001');

      expect(useViewerStore.getState().caseError).toBeNull();
    });
  });

  describe('startDocument', () => {
    it('forgets the last document and remembers which one is loading', () => {
      initializeViewer(twoCases, firstDetails, allDetails);
      useViewerStore.getState().selectCase('CASE-002');

      useViewerStore.getState().startDocument('doc-2');

      const state = useViewerStore.getState();
      expect(state.documentId).toBe('doc-2');
      expect(state.details).toBeNull();
      expect(state.allDetails).toEqual([]);
      expect(state.currentCaseNumber).toBeUndefined();
    });
  });
});
