import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PdfDetails from './PdfDetails';
import { makeCase, threeCases } from '../../test/fixtures';

/**
 * Tests for the details sidebar.
 *
 * ── Why CaseSelector is mocked ──
 *
 * PdfDetails renders <CaseSelector>, which renders whichever dropdown
 * ACTIVE_VARIANT points at — currently the KendoReact one. Pulling a
 * third-party widget into these tests would mean:
 *
 *   - re-testing Kendo's behaviour, which its own suite already covers
 *   - breaking every test in this file the day someone flips ACTIVE_VARIANT
 *
 * A unit test should fail for one reason. So we swap in a stand-in and assert
 * only that PdfDetails decided to render it. The dropdowns are tested properly
 * in CustomDropdown.test.tsx.
 *
 * The stand-in is found by test id rather than by role: the "query by role"
 * rule is about testing real UI, and this is deliberately not real UI.
 */
vi.mock('../CaseSelector', () => ({
  default: () => <div data-testid="case-selector">case selector</div>,
}));

function renderDetails(props: Partial<React.ComponentProps<typeof PdfDetails>> = {}) {
  const onToggleStamp = vi.fn();
  const onClose = vi.fn();

  render(
    <PdfDetails
      metadata={makeCase()}
      showStamp={false}
      onToggleStamp={onToggleStamp}
      isMobile={false}
      isOpen={false}
      onClose={onClose}
      allCases={threeCases}
      hasMultipleCases
      selectedCaseId="1"
      onSelectCase={vi.fn()}
      {...props}
    />,
  );

  return { onToggleStamp, onClose, user: userEvent.setup() };
}

describe('PdfDetails', () => {
  describe('before a case is selected', () => {
    it('shows the dropdown but no document details', () => {
      renderDetails({ metadata: null, selectedCaseId: null });

      expect(screen.getByTestId('case-selector')).toBeInTheDocument();

      // This is the rule the no-default-selection behaviour exists for:
      // an empty panel, rather than details for a document nobody picked.
      expect(screen.queryByRole('heading', { name: 'General' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Tags' })).not.toBeInTheDocument();
    });

    it('still shows the panel heading', () => {
      renderDetails({ metadata: null, selectedCaseId: null });

      expect(screen.getByRole('heading', { name: 'Document Details' })).toBeInTheDocument();
    });

    it('offers no stamp toggle, since there is nothing to stamp', () => {
      renderDetails({ metadata: null, selectedCaseId: null });

      expect(screen.queryByRole('radio', { name: 'With stamp' })).not.toBeInTheDocument();
    });
  });

  describe('once a case is selected', () => {
    it('fills in the document metadata', () => {
      renderDetails();

      expect(screen.getByText('Q1 2026 Market Report')).toBeInTheDocument();
      expect(screen.getByText('Global Markets Research Division')).toBeInTheDocument();
      expect(screen.getByText('Published')).toBeInTheDocument();
      expect(screen.getByText('q1-market-report.pdf')).toBeInTheDocument();
      expect(screen.getByText('38 KB')).toBeInTheDocument();
    });

    it('lists every tag', () => {
      renderDetails({ metadata: makeCase({ tags: ['quarterly', 'Q1', 'equity'] }) });

      expect(screen.getByText('quarterly')).toBeInTheDocument();
      expect(screen.getByText('Q1')).toBeInTheDocument();
      expect(screen.getByText('equity')).toBeInTheDocument();
    });

    it('shows all the detail sections', () => {
      renderDetails();

      for (const section of ['General', 'Description', 'File Info', 'Dates', 'Tags']) {
        expect(screen.getByRole('heading', { name: section })).toBeInTheDocument();
      }
    });
  });

  describe('case number display', () => {
    it('shows the dropdown when there are several cases', () => {
      renderDetails({ hasMultipleCases: true });

      expect(screen.getByTestId('case-selector')).toBeInTheDocument();
    });

    it('shows plain text instead when there is only one case', () => {
      renderDetails({ hasMultipleCases: false, metadata: makeCase() });

      // Nothing to choose, so a dropdown would just be noise.
      expect(screen.queryByTestId('case-selector')).not.toBeInTheDocument();
      expect(screen.getByText('CASE-2026-001')).toBeInTheDocument();
    });
  });

  describe('stamp toggle', () => {
    it('reflects the current choice', () => {
      renderDetails({ showStamp: false });

      expect(screen.getByRole('radio', { name: 'Without stamp' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'With stamp' })).not.toBeChecked();
    });

    it('reports when the user turns the stamp on', async () => {
      const { user, onToggleStamp } = renderDetails({ showStamp: false });

      await user.click(screen.getByRole('radio', { name: 'With stamp' }));

      expect(onToggleStamp).toHaveBeenCalledWith(true);
    });

    it('reports when the user turns the stamp off', async () => {
      const { user, onToggleStamp } = renderDetails({ showStamp: true });

      await user.click(screen.getByRole('radio', { name: 'Without stamp' }));

      expect(onToggleStamp).toHaveBeenCalledWith(false);
    });

    it('groups the radios so screen readers announce the question', () => {
      renderDetails();

      // A <fieldset> with a <legend> is what turns two loose radios into
      // "Download: without stamp / with stamp" for assistive tech.
      expect(screen.getByRole('group', { name: 'Download' })).toBeInTheDocument();
    });
  });

  describe('mobile overlay', () => {
    it('is a plain sidebar on desktop', () => {
      renderDetails({ isMobile: false });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Close details' })).not.toBeInTheDocument();
    });

    it('becomes a modal dialog on mobile once open', () => {
      renderDetails({ isMobile: true, isOpen: true });

      // It covers the whole screen there, so it has to announce itself as a
      // modal rather than as one region among several.
      expect(screen.getByRole('dialog', { name: 'Document Details' }))
        .toHaveAttribute('aria-modal', 'true');
    });

    it('is not modal while closed, even on mobile', () => {
      renderDetails({ isMobile: true, isOpen: false });

      // Off-screen but still in the DOM — claiming to be modal here would
      // trap a screen reader in a panel the user cannot see.
      expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-modal');
    });

    it('offers a close button on mobile', async () => {
      const { user, onClose } = renderDetails({ isMobile: true, isOpen: true });

      await user.click(screen.getByRole('button', { name: 'Close details' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
