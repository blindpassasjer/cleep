import type { NoteColor } from '../types';

// eslint-disable-next-line react-refresh/only-export-components -- a plain constant, no HMR concern
export const COLORS: NoteColor[] = ['default', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'gray'];

export function ColorPicker({ value, onChange }: { value: NoteColor; onChange: (color: NoteColor) => void }) {
  return (
    <div className="color-picker">
      {COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`color-swatch color-${color} ${value === color ? 'selected' : ''}`}
          title={color}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
