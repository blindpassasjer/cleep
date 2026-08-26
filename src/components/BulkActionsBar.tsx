import { useState } from 'react';
import { IconArchive, IconClose, IconPalette, IconTag, IconTrash } from './Icons';
import { ColorPicker } from './ColorPicker';
import type { Label, NoteColor } from '../types';

interface Props {
  count: number;
  labels: Label[];
  onClear: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onColor: (color: NoteColor) => void;
  onLabel: (labelId: string) => void;
}

export function BulkActionsBar({ count, labels, onClear, onArchive, onTrash, onColor, onLabel }: Props) {
  const [showColors, setShowColors] = useState(false);
  const [showLabels, setShowLabels] = useState(false);

  return (
    <div className="bulk-bar">
      <div className="bulk-bar-row">
        <button type="button" className="bulk-bar-close" title="Clear selection" onClick={onClear}>
          <IconClose />
        </button>
        <span className="bulk-bar-count">{count} selected</span>
        <div className="bulk-bar-actions">
          <button
            type="button"
            title="Color"
            onClick={() => {
              setShowColors((v) => !v);
              setShowLabels(false);
            }}
          >
            <IconPalette />
          </button>
          <button
            type="button"
            title="Collections"
            onClick={() => {
              setShowLabels((v) => !v);
              setShowColors(false);
            }}
          >
            <IconTag />
          </button>
          <button type="button" title="Archive" onClick={onArchive}>
            <IconArchive />
          </button>
          <button type="button" title="Delete" onClick={onTrash}>
            <IconTrash />
          </button>
        </div>
      </div>
      {showColors && (
        <div className="bulk-bar-panel">
          <ColorPicker value={'default' as NoteColor} onChange={onColor} />
        </div>
      )}
      {showLabels && (
        <div className="bulk-bar-panel bulk-bar-labels">
          {labels.length === 0 && <span className="note-labels-empty">No collections yet.</span>}
          {labels.map((label) => (
            <button key={label.id} type="button" className="bulk-bar-label" onClick={() => onLabel(label.id)}>
              {label.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
