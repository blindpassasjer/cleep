import { useState } from 'react';
import { ColorPicker } from './ColorPicker';
import type { NoteColor } from '../types';

/** Collapses the full swatch row into a single button + popover -- used in the note editor
 * footers, where showing all 11 swatches inline eats into the already-tight vertical space left
 * once the on-screen keyboard is up. */
export function ColorPickerButton({ value, onChange }: { value: NoteColor; onChange: (color: NoteColor) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="color-picker-button-wrap">
      <button type="button" title="Color" className="color-picker-toggle" onClick={() => setOpen((v) => !v)}>
        <span className={`color-swatch color-${value}`} />
      </button>
      {open && (
        <div className="color-picker-popover">
          <ColorPicker
            value={value}
            onChange={(color) => {
              onChange(color);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
