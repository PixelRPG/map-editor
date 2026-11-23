// Pure model behind the flag picker: the list a flag choice offers, and
// how a choice is read. GTK-free (and gettext-free) so it can be specced;
// the caller owns every translated string.

/** One flag as the picker lists it: the stored id and the name shown. */
export interface FlagChoice {
  value: string
  label: string
}

/** The list entry that means "make a new flag" — never a real id (ids match `^[a-z0-9]`). */
export const NEW_FLAG_VALUE = '+new'

export interface FlagPickerLabels {
  /** Shown for an empty choice. */
  none: string
  /** The "New…" entry. */
  create: string
  /** Shown for an id the project no longer has: the id itself would mean nothing to a child. */
  missing: string
}

/**
 * The rows of a flag picker, in order: the empty choice, the project's
 * flags by name, a stored id the project lost (so the row still shows
 * what the action holds instead of silently picking the first flag), and
 * "New…" last.
 */
export function flagPickerOptions(
  flags: readonly FlagChoice[],
  current: string,
  labels: FlagPickerLabels,
): FlagChoice[] {
  const rows: FlagChoice[] = [{ value: '', label: labels.none }, ...flags]
  if (current && !flags.some((f) => f.value === current)) rows.push({ value: current, label: labels.missing })
  rows.push({ value: NEW_FLAG_VALUE, label: labels.create })
  return rows
}

/** A flag's name for display; an id the project lost reads `missing`, never the raw id. */
export function flagDisplayName(flags: readonly FlagChoice[], id: string, missing: string): string {
  return flags.find((f) => f.value === id)?.label ?? missing
}

/** Whether a picked value is the "New…" entry. */
export function isNewFlagChoice(value: string): boolean {
  return value === NEW_FLAG_VALUE
}

/** The name typed into the "New…" dialog, trimmed; `null` when it is empty or already a flag's name. */
export function cleanNewFlagName(typed: string, flags: readonly FlagChoice[]): string | null {
  const name = typed.trim()
  if (!name) return null
  const lower = name.toLowerCase()
  if (flags.some((f) => f.label.toLowerCase() === lower)) return null
  return name
}

/** The id of the flag already named `typed` (case-blind), so "New…" reuses it instead of duplicating. */
export function existingFlagId(typed: string, flags: readonly FlagChoice[]): string | null {
  const lower = typed.trim().toLowerCase()
  if (!lower) return null
  return flags.find((f) => f.label.toLowerCase() === lower)?.value ?? null
}
