import { PLACEMENT_OPTIONS } from './placement';
import type { AttachmentPlacement } from './placement';
import './PlacementSwitcher.css';

interface PlacementSwitcherProps {
  placement: AttachmentPlacement;
  onChange: (placement: AttachmentPlacement) => void;
}

/**
 * Research scaffolding, not product UI.
 *
 * Switches which attachment indicator is mounted, so the three can be compared
 * live against real documents instead of by rebuilding between them. It is
 * styled to look like a dev control rather than part of the app, so nobody
 * reviewing a screenshot mistakes it for something being proposed.
 *
 * Delete this, and `placement` with it, once the ticket has an answer.
 */
export default function PlacementSwitcher({ placement, onChange }: PlacementSwitcherProps) {
  const active = PLACEMENT_OPTIONS.find((option) => option.id === placement);

  return (
    <div className="placement-switcher">
      <label className="placement-switcher-label" htmlFor="attachment-placement">
        Indicator
      </label>
      <select
        id="attachment-placement"
        className="placement-switcher-select"
        value={placement}
        onChange={(event) => onChange(event.target.value as AttachmentPlacement)}
      >
        {PLACEMENT_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {/* Visible rather than a tooltip: in a review session the person driving
          is rarely the person asking "which one is this again?". */}
      <p className="placement-switcher-summary">{active?.summary}</p>
    </div>
  );
}
