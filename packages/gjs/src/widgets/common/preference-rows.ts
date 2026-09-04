import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

/**
 * Factories for the three editable `Adw.PreferencesRow` shapes the
 * data-driven inspectors build at runtime: a text entry, a bounded
 * integer spinner and a value/label dropdown.
 *
 * Stateless module functions rather than a static-only class — each
 * returns a fresh row already wired to `onChange`, so the caller only
 * decides what to do with the value.
 */

/** One choice in a {@link comboRow}: the stored value and its display label. */
export interface RowOption {
  value: string
  label: string
}

/** Free-text row; `onChange` fires on every keystroke. */
export function entryRow(title: string, value: string, onChange: (value: string) => void): Adw.EntryRow {
  const row = new Adw.EntryRow({ title })
  row.set_text(value)
  row.connect('changed', () => onChange(row.get_text()))
  return row
}

/** Whole-number spinner over `[min, max]`; `onChange` gets the rounded value. */
export function spinRow(
  title: string,
  value: number,
  range: { min: number; max: number; step: number },
  onChange: (value: number) => void,
): Adw.SpinRow {
  const adjustment = new Gtk.Adjustment({
    lower: range.min,
    upper: range.max,
    stepIncrement: range.step,
    value,
  })
  const row = new Adw.SpinRow({ title, adjustment, digits: 0 })
  row.connect('notify::value', () => onChange(Math.round(row.get_value())))
  return row
}

/**
 * Dropdown over `options`. A `current` that isn't in the list leaves the
 * row on its first entry — which is how callers surface a "(None)" state
 * without a separate sentinel.
 */
export function comboRow(
  title: string,
  options: readonly RowOption[],
  current: string,
  onChange: (value: string) => void,
): Adw.ComboRow {
  const values = options.map((o) => o.value)
  const row = new Adw.ComboRow({ title, model: Gtk.StringList.new(options.map((o) => o.label)) })
  const initial = values.indexOf(current)
  if (initial >= 0) row.set_selected(initial)
  row.connect('notify::selected', () => {
    const i = row.get_selected()
    if (i >= 0 && i < values.length) onChange(values[i])
  })
  return row
}
