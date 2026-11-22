import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { type LocalizedText, localeLabel } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import { type TextLanguageState, textShown, textWritten } from './text-language.model.ts'

/** A text row plus the ways to keep it in step with the editor's language. */
export interface LocalizedEntryRow {
  row: Adw.EntryRow
  /** Stop following the shared language (the row is being thrown away). */
  dispose: () => void
}

/**
 * THE row every authored text uses (a single text, a line of a list, a
 * show-text line, an ask prompt or answer). With 2+ project languages a
 * small switch at its end picks the language being written; with one it
 * is a plain entry row, exactly as before. Reshaping or removing the
 * switch happens here and nowhere else.
 */
export function localizedEntryRow(options: {
  title: string
  state: TextLanguageState
  get: () => LocalizedText | undefined
  set: (next: LocalizedText) => void
}): LocalizedEntryRow {
  const { state } = options
  const row = new Adw.EntryRow({ title: options.title })
  let syncing = false
  let toggle: Gtk.Button | null = null

  const refresh = () => {
    const shown = textShown(options.get(), state.locale, state.fallback)
    syncing = true
    if (row.get_text() !== shown.value) row.set_text(shown.value)
    syncing = false
    const delegate = row.get_delegate()
    if (delegate instanceof Gtk.Text) delegate.set_placeholder_text(shown.hint)
    if (toggle) {
      toggle.set_label(state.locale.toUpperCase())
      toggle.set_tooltip_text(_('Writing in %s. Click to switch language.').replace('%s', localeLabel(state.locale)))
    }
  }

  row.connect('changed', () => {
    if (syncing) return
    options.set(textWritten(options.get(), state.locale, state.fallback, row.get_text()))
  })

  if (state.multi) {
    toggle = new Gtk.Button({ cssClasses: ['flat', 'caption-heading'], valign: Gtk.Align.CENTER })
    toggle.connect('clicked', () => state.cycle())
    row.add_suffix(toggle)
  }
  refresh()
  return { row, dispose: state.track(refresh) }
}
