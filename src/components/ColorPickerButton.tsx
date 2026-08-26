import { useRef, useState } from 'react';
import { ColorPicker } from './ColorPicker';
import { IconPalette } from './Icons';
import { useOutsideClick } from '../hooks/useOutsideClick';
import type { NoteColor } from '../types';

/** Collapses the full swatch row into a single button + popover -- used in the note editor
 * footers, where showing all 11 swatches inline eats into the already-tight vertical space left
 * once the on-screen keyboard is up. Uses the same palette glyph as the grid card's Color button
 * (NoteCard) rather than a live color swatch, so the "open the color picker" affordance looks the
 * same everywhere instead of two different icons for the same action. */
export function ColorPickerButton({ value, onChange }: { value: NoteColor; onChange: (color: NoteColor) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useOutsideClick(wrapRef, open, () => setOpen(false));

  return (
    <div className="color-picker-button-wrap" ref={wrapRef}>
      <button type="button" title="Color" className="color-picker-toggle" onClick={() => setOpen((v) => !v)}>
        <IconPalette />
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
