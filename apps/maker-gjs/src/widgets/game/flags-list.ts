import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { gettext as _, ngettext } from 'gettext'

import type { CheckupLink } from '../../services/game-checkup.model.ts'
import type { FlagRow, FlagUsageRow } from '../../services/game-flags.model.ts'

/** "Used in 3 places" / "Not used yet" — the count shown in the flag's row. */
export function flagUsageSummary(count: number): string {
  if (count === 0) return _('Not used yet')
  return ngettext('Used in %d place', 'Used in %d places', count).replace('%d', String(count))
}

function usageRow(usage: FlagUsageRow, onOpen: (link: CheckupLink) => void): Adw.ActionRow {
  const reads = usage.access === 'read'
  const subtitle = usage.mapName
    ? reads
      ? _('Checks it, on %s').replace('%s', usage.mapName)
      : _('Changes it, on %s').replace('%s', usage.mapName)
    : reads
      ? _('Checks it')
      : _('Changes it')
  const row = new Adw.ActionRow({
    title: usage.thingName,
    subtitle,
    useMarkup: false,
    titleLines: 1,
    subtitleLines: 1,
    activatable: usage.link !== null,
  })
  if (usage.link) {
    const link = usage.link
    row.add_suffix(new Gtk.Image({ iconName: 'go-next-symbolic', valign: Gtk.Align.CENTER }))
    row.connect('activated', () => onOpen(link))
  }
  return row
}

/**
 * One flag as an expandable row: the count in the subtitle, the places
 * that read or write it inside. A flag nothing uses says so and offers
 * its removal; a used one is refused by the store, which names this list.
 */
export function buildFlagRow(row: FlagRow, onOpen: (link: CheckupLink) => void, onRemove: () => void): Adw.ExpanderRow {
  const expander = new Adw.ExpanderRow({
    title: row.name,
    subtitle: flagUsageSummary(row.usages.length),
    useMarkup: false,
    titleLines: 1,
    subtitleLines: 1,
  })
  for (const usage of row.usages) expander.add_row(usageRow(usage, onOpen))
  if (row.usages.length === 0) {
    const remove = new Adw.ButtonRow({ title: _('Remove flag') })
    remove.add_css_class('destructive-action')
    remove.connect('activated', onRemove)
    expander.add_row(remove)
  }
  return expander
}
