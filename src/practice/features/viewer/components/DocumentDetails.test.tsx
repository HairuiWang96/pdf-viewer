import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentDetailsPanel } from './DocumentDetails';
import { useViewerStore, initializeViewer } from '../data/viewerStore';
import type { DocumentDetailsData } from '../types/document';

/**
 * Tests for the details panel against the case number requirement: which
 * fields show for one case, for several, after a pick, and when a case's
 * details are missing. The real store and Kendo components are used. The store
 * is filled the way the other project's loader fills it: cases is [] for a
 * one-case document, and allDetails holds every case's details.
 */

const twoCases = [{ caseNumber: 'CASE-001' }, { caseNumber: 'CASE-002' }];
const firstDetails: DocumentDetailsData = {
  caseNumber: 'CASE-001',
  caseName: 'First v. Case',
  filedBy: 'Alice',
};
const secondDetails: DocumentDetailsData = {
  caseNumber: 'CASE-002',
  caseName: 'Second v. Case',
  filedBy: 'Bob',
};
const allDetails = [firstDetails, secondDetails];

function renderPanel() {
  const user = userEvent.setup();
  render(<DocumentDetailsPanel />);
  return { user };
}

// The arrow button opens the ComboBox's list; clicking the text box does not
async function pick(user: ReturnType<typeof userEvent.setup>, caseNumber: string) {
  await user.click(screen.getByRole('button', { name: 'expand combobox' }));
  await user.click(screen.getByRole('option', { name: caseNumber }));
}

describe('DocumentDetailsPanel', () => {
  beforeEach(() => {
    useViewerStore.setState(useViewerStore.getInitialState(), true);
  });

  afterEach(() => {
    cleanup();
  });

  describe('one case', () => {
    it('shows the case number and the details straight away', () => {
      // cases: [] is what the backend sends for a one-case document
      initializeViewer([], firstDetails, [firstDetails]);
      renderPanel();

      expect(screen.getByText('CASE-001')).toBeInTheDocument();
      expect(screen.getByText('First v. Case')).toBeInTheDocument();
      expect(screen.getByText('Filed By')).toBeInTheDocument();
      expect(screen.getByText('Case Stamp')).toBeInTheDocument();
    });
  });

  describe('several cases', () => {
    it('opens on the placeholder, not on a case number', () => {
      // The first details belong to a case (CASE-001 here), but with several
      // cases nothing may be pre-selected: the user has to pick one.
      initializeViewer(twoCases, firstDetails, allDetails);
      renderPanel();

      // A ComboBox is a text box: the placeholder is an attribute, the
      // selected case its value
      expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', 'Select a case number');
      expect(screen.getByRole('combobox')).toHaveValue('');
    });

    it('hides the details until a case is picked', () => {
      initializeViewer(twoCases, firstDetails, allDetails);
      renderPanel();

      expect(screen.queryByText('First v. Case')).not.toBeInTheDocument();
      expect(screen.queryByText('Filed By')).not.toBeInTheDocument();
      expect(screen.queryByText('Case Stamp')).not.toBeInTheDocument();
    });

    it('shows the picked case’s details', async () => {
      initializeViewer(twoCases, firstDetails, allDetails);
      const { user } = renderPanel();

      await pick(user, 'CASE-002');

      expect(screen.getByText('Second v. Case')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('refreshes the details when a different case is picked', async () => {
      initializeViewer(twoCases, firstDetails, allDetails);
      const { user } = renderPanel();

      await pick(user, 'CASE-001');
      expect(screen.getByText('First v. Case')).toBeInTheDocument();

      await pick(user, 'CASE-002');
      expect(screen.getByText('Second v. Case')).toBeInTheDocument();
      expect(screen.queryByText('First v. Case')).not.toBeInTheDocument();
    });

    it('says the case is unavailable when its details are missing', async () => {
      // CASE-002 is in the list, but the backend sent no details for it
      initializeViewer(twoCases, firstDetails, [firstDetails]);
      const { user } = renderPanel();

      await pick(user, 'CASE-002');

      expect(screen.getByRole('alert')).toHaveTextContent('CASE-002 is unavailable');
      expect(screen.queryByText('Filed By')).not.toBeInTheDocument();
    });
  });
});
