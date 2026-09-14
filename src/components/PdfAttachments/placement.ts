/**
 * The three indicator placements under evaluation.
 *
 * This is a research ticket: the question is not "does an attachments panel
 * work" but "where should the indicator live, and how should it behave". Each
 * placement is a genuinely different design rather than the same component
 * moved around, because the interesting differences are behavioural —
 * how loudly it announces itself, how much room it costs, and whether it reads
 * as part of the document or part of the tooling.
 *
 * One is active at a time, switched from the header at runtime so the three
 * can be compared against real documents without a rebuild.
 */
export type AttachmentPlacement = 'bottom' | 'toolbar' | 'details';

export interface PlacementOption {
  id: AttachmentPlacement;
  label: string;
  /** Shown under the switcher, so a reviewer knows what they are looking at. */
  summary: string;
}

export const PLACEMENT_OPTIONS: PlacementOption[] = [
  {
    id: 'bottom',
    label: 'Bottom bar',
    summary: 'Persistent bar pinned under the document. Always visible, expands in place.',
  },
  {
    id: 'toolbar',
    label: 'Toolbar',
    summary: 'Icon and count in the viewer toolbar. Compact, opens a popover.',
  },
  {
    id: 'details',
    label: 'Details panel',
    summary: 'A section in Document Details, alongside the other file metadata.',
  },
];

export const DEFAULT_PLACEMENT: AttachmentPlacement = 'bottom';
