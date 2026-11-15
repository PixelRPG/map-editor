import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { confirmDestructive } from '@pixelrpg/gjs'
import { gettext as _, ngettext } from 'gettext'
import { MAP_SIZE_PRESETS, type MapSize, type MapSizePresetKey } from '../../services/project-store-maps.ts'

/**
 * The World view's map dialogs — New map, Map settings, Delete map.
 * Built imperatively like `objects/object-dialogs.ts` rather than as
 * composite templates, because each one is a single throwaway form
 * with no state to keep between presentations.
 *
 * Rename and Duplicate are not here: both are a name prompt, which
 * `promptRename` from `@pixelrpg/gjs` already is.
 */

/** Smallest and largest custom map the dialog's spin rows allow (tiles). */
const CUSTOM_MIN = 1
const CUSTOM_MAX = 512

/** `name` of the Custom toggle — not a {@link MAP_SIZE_PRESETS} key. */
const CUSTOM = 'custom'

/** What the user asked for in the New map dialog. */
export interface NewMapRequest {
  name: string
  size: MapSize
}

/** Display order of the size presets, with the caption § 6.1 gives each. */
const PRESETS: readonly { key: MapSizePresetKey; label: () => string; caption: () => string }[] = [
  { key: 'small', label: () => _('Small'), caption: () => _('one screen') },
  { key: 'medium', label: () => _('Medium'), caption: () => _('a village') },
  { key: 'large', label: () => _('Large'), caption: () => _('a forest') },
]

/** `20 × 14` — the tile dimensions, with the typographic multiplication sign. */
function sizeText(size: MapSize): string {
  return `${size.columns} × ${size.rows}`
}

/**
 * Present the New map dialog (REDESIGN.md § 6.1): a name, pre-filled
 * with the next free number and selected for overtyping, plus the three
 * size presets. Full view adds a Custom toggle revealing two spin rows,
 * so the preset buttons stay the only size control a child has to read.
 *
 * The Tiles and Floor rows the spec also lists are left out until a
 * starter tileset exists to populate them (human task H1) — see TODO.md.
 *
 * `onCreate` runs with a trimmed, non-empty name; cancelling calls
 * nothing.
 */
export function presentNewMapDialog(
  parent: Gtk.Widget,
  options: { suggestedName: string; fullView: boolean },
  onCreate: (request: NewMapRequest) => void,
): void {
  const dialog = new Adw.AlertDialog({ heading: _('New map') })

  const nameRow = new Adw.EntryRow({ title: _('Name'), text: options.suggestedName })
  const nameGroup = new Adw.PreferencesGroup()
  nameGroup.add(nameRow)

  const toggles = new Adw.ToggleGroup({ homogeneous: true })
  for (const preset of PRESETS) toggles.add(new Adw.Toggle({ name: preset.key, label: preset.label() }))
  if (options.fullView) toggles.add(new Adw.Toggle({ name: CUSTOM, label: _('Custom') }))
  toggles.set_active_name('small')

  // Echoes the chosen preset in words and tiles. The captions are a
  // label rather than each toggle's tooltip alone: a touch user never
  // sees a tooltip, and "one screen" is the part that makes the choice
  // mean something.
  const caption = new Gtk.Label({ halign: Gtk.Align.CENTER, marginTop: 6 })
  caption.add_css_class('caption')
  caption.add_css_class('dim-label')

  const sizeBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  sizeBox.append(toggles)
  sizeBox.append(caption)
  const sizeGroup = new Adw.PreferencesGroup({ title: _('Size') })
  sizeGroup.add(sizeBox)

  const columnsRow = new Adw.SpinRow({
    title: _('Columns'),
    adjustment: new Gtk.Adjustment({ lower: CUSTOM_MIN, upper: CUSTOM_MAX, stepIncrement: 1, pageIncrement: 10 }),
  })
  const rowsRow = new Adw.SpinRow({
    title: _('Rows'),
    adjustment: new Gtk.Adjustment({ lower: CUSTOM_MIN, upper: CUSTOM_MAX, stepIncrement: 1, pageIncrement: 10 }),
  })
  columnsRow.set_value(MAP_SIZE_PRESETS.small.columns)
  rowsRow.set_value(MAP_SIZE_PRESETS.small.rows)
  const customGroup = new Adw.PreferencesGroup({ visible: false })
  customGroup.add(columnsRow)
  customGroup.add(rowsRow)

  const chosenSize = (): MapSize => {
    const key = toggles.get_active_name()
    // Rounded because a spin row's value is a double: `digits: 0` only
    // controls what it DISPLAYS, and 3.5 columns breaks tile math.
    if (key === CUSTOM) {
      return { columns: Math.round(columnsRow.get_value()), rows: Math.round(rowsRow.get_value()) }
    }
    return MAP_SIZE_PRESETS[(key ?? 'small') as MapSizePresetKey]
  }

  const refreshSize = () => {
    const key = toggles.get_active_name()
    const custom = key === CUSTOM
    customGroup.set_visible(custom)
    if (custom) {
      caption.set_label(sizeText(chosenSize()))
      return
    }
    const preset = PRESETS.find((p) => p.key === key) ?? PRESETS[0]
    caption.set_label(`${preset.caption()} · ${sizeText(MAP_SIZE_PRESETS[preset.key])}`)
  }
  toggles.connect('notify::active-name', refreshSize)
  columnsRow.connect('notify::value', refreshSize)
  rowsRow.connect('notify::value', refreshSize)
  refreshSize()

  const body = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12 })
  body.append(nameGroup)
  body.append(sizeGroup)
  body.append(customGroup)
  dialog.set_extra_child(body)

  dialog.add_response('cancel', _('Cancel'))
  dialog.add_response('create', _('Create'))
  dialog.set_response_appearance('create', Adw.ResponseAppearance.SUGGESTED)
  dialog.set_default_response('create')
  dialog.set_close_response('cancel')
  dialog.connect('response', (_d: Adw.AlertDialog, response: string) => {
    const name = nameRow.get_text().trim()
    if (response !== 'create' || !name) return
    onCreate({ name, size: chosenSize() })
  })

  dialog.present(parent)
  // After `present`, so the entry already has focus to select within.
  nameRow.select_region(0, -1)
}

/** One row of the settings dialog's door list, already resolved. */
export interface MapSettingsDoor {
  /** The door's own label, e.g. the tile it sits on. */
  label: string
  /** Display name of the map at the other end, `''` when there is none. */
  otherSceneName: string
  direction: 'in' | 'out'
}

/** Everything the Map settings dialog states about one map. */
export interface MapSettings {
  name: string
  columns: number
  rows: number
  tileWidth: number
  tileHeight: number
  /** NPCs plus events placed on the map. */
  things: number
  doors: readonly MapSettingsDoor[]
}

/**
 * Present the Map settings dialog (REDESIGN.md § 5.4) — an
 * `Adw.PreferencesDialog`, so it is instant-apply and has no OK button
 * to imply the rest of it is editable.
 *
 * It shows what `MapData` actually carries. The name is the one
 * editable field and goes out through `onRename` so it rides the same
 * `map.rename` command as the context menu's verb; size, tile size,
 * the thing count and the door list are read-only facts. The music,
 * encounters and on-enter rows the old Props pane listed are NOT here:
 * the schema has no field for any of them, so the rows would need a
 * schema invented first — see TODO.md.
 */
export function presentMapSettingsDialog(
  parent: Gtk.Widget,
  settings: MapSettings,
  onRename: (name: string) => void,
): void {
  const dialog = new Adw.PreferencesDialog({ title: _('Map settings') })
  const page = new Adw.PreferencesPage()

  const general = new Adw.PreferencesGroup({ title: _('General') })
  const nameRow = new Adw.EntryRow({ title: _('Name'), text: settings.name, showApplyButton: true })
  nameRow.connect('apply', () => {
    const name = nameRow.get_text().trim()
    // An emptied entry is a slip, not a request to unname the map:
    // restore what it had rather than renaming to "".
    if (!name) {
      nameRow.set_text(settings.name)
      return
    }
    onRename(name)
  })
  general.add(nameRow)
  general.add(readOnlyRow(_('Size'), _('%s tiles').replace('%s', sizeText(settings))))
  general.add(readOnlyRow(_('Tile size'), _('%s px').replace('%s', `${settings.tileWidth} × ${settings.tileHeight}`)))
  general.add(readOnlyRow(_('Things'), String(settings.things)))
  page.add(general)

  // Doors are read-only here on purpose: retargeting one is the § 6.2
  // pick-mode flow, which starts on the map, not in a list.
  const doors = new Adw.PreferencesGroup({ title: _('Doors') })
  if (settings.doors.length === 0) {
    doors.set_description(_('No doors lead to or from this map.'))
  }
  for (const door of settings.doors) {
    // A door with no other end still gets a row: what it needs is
    // finishing, and a missing row would read as a missing door.
    const nowhere = door.otherSceneName.length === 0
    const row = new Adw.ActionRow({
      title: nowhere ? _('Goes nowhere') : door.otherSceneName,
      subtitle: nowhere
        ? _('No map at the other end yet')
        : door.direction === 'out'
          ? _('Leads out of this map')
          : _('Leads into this map'),
    })
    const icon = nowhere
      ? 'dialog-warning-symbolic'
      : door.direction === 'out'
        ? 'go-next-symbolic'
        : 'go-previous-symbolic'
    row.add_prefix(new Gtk.Image({ iconName: icon }))
    if (door.label) row.add_suffix(dimLabel(door.label))
    doors.add(row)
  }
  page.add(doors)

  dialog.add(page)
  dialog.present(parent)
}

/** A fact, not a control: the value sits where a widget would. */
function readOnlyRow(title: string, value: string): Adw.ActionRow {
  const row = new Adw.ActionRow({ title })
  row.add_suffix(dimLabel(value))
  return row
}

function dimLabel(text: string): Gtk.Label {
  const label = new Gtk.Label({ label: text, valign: Gtk.Align.CENTER })
  label.add_css_class('dim-label')
  return label
}

/**
 * Confirm deleting a map, naming how many doors lead INTO it — every
 * one of them stops working, and that is the consequence the user
 * cannot see from the atlas.
 */
export function confirmMapDelete(
  parent: Gtk.Widget,
  map: { name: string; doorsInto: number },
  onConfirmed: () => void,
): void {
  const sentence = _('“%s” and everything on it will be deleted.').replace('%s', map.name)
  // Concatenated rather than one msgid with two placeholders: a map name
  // containing a literal "%s" would otherwise swallow the second one.
  const doors = ngettext(
    '%d door leads here and will stop working.',
    '%d doors lead here and will stop working.',
    map.doorsInto,
  ).replace('%d', String(map.doorsInto))
  const body = map.doorsInto > 0 ? `${sentence} ${doors}` : sentence
  void confirmDestructive(parent, { heading: _('Delete map?'), body }).then((confirmed) => {
    if (confirmed) onConfirmed()
  })
}
