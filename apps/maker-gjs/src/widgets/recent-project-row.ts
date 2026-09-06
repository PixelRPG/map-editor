import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { MapPreview } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import type { RecentProjectEntry } from '../services/recent-projects.ts'
import { formatRelativeTime } from '../services/recent-time.ts'

/**
 * One recent-projects row, shared by the welcome view's recents column
 * and the "Open Recent" dialog so both render the same bookmark the
 * same way.
 *
 * An entry whose project file has vanished is rendered as a greyed-out
 * "missing" row rather than dropped: the path may be an unmounted drive
 * or a checkout that comes back, and silently deleting a bookmark the
 * user still recognises is worse than showing it as unavailable. Such a
 * row is insensitive (it cannot be opened into a guaranteed load
 * failure) and — the part that actually cost something — gets no
 * {@link MapPreview}, which is what used to log a full `FetchError`
 * stack trace per entry, on every visit to the welcome view.
 */
export function buildRecentProjectRow(recent: RecentProjectEntry, onOpen: (path: string) => void): Adw.ActionRow {
  // Meta line: "<caption> · <N maps> · <when>" — parts drop out when
  // unknown (caption may be empty; sceneCount is absent on entries
  // recorded before the field existed).
  const parts: string[] = []
  if (recent.missing) parts.push(_('Missing — file not found'))
  if (recent.caption) parts.push(recent.caption)
  if (recent.sceneCount)
    parts.push(recent.sceneCount === 1 ? _('1 map') : _('%d maps').replace('%d', String(recent.sceneCount)))
  if (recent.openedAt) parts.push(formatRelativeTime(recent.openedAt))
  const row = new Adw.ActionRow({
    title: recent.name,
    subtitle: parts.join(' · ') || recent.path,
    subtitle_lines: 2,
    tooltip_text: recent.path,
    activatable: !recent.missing,
    sensitive: !recent.missing,
  })
  if (recent.missing) {
    row.add_prefix(new Gtk.Image({ icon_name: 'dialog-warning-symbolic', pixel_size: 16 }))
    row.add_suffix(new Gtk.Image({ icon_name: 'action-unavailable-symbolic', pixel_size: 12 }))
    return row
  }
  // Live map thumbnail — same MapPreview pipeline as the template cards.
  // Deferred so eight rows don't block the main loop in a row.
  const preview = new MapPreview()
  preview.set_size_request(48, 32)
  preview.add_css_class('engine-canvas')
  preview.valign = Gtk.Align.CENTER
  void Promise.resolve()
    .then(() => preview.loadProject(recent.path))
    .catch(() => {})
  row.add_prefix(preview)
  row.add_suffix(new Gtk.Image({ icon_name: 'go-next-symbolic', pixel_size: 12 }))
  row.connect('activated', () => onOpen(recent.path))
  return row
}
