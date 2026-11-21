import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import Gtk from '@girs/gtk-4.0'
import type { SpriteSetReference } from '@pixelrpg/engine'
import { confirmDestructive } from '@pixelrpg/gjs'
import { gettext as _, ngettext } from 'gettext'
import {
  MAP_SIZE_PRESETS,
  type MapGround,
  type MapSize,
  type MapSizePresetKey,
} from '../../services/project-store-maps.ts'

/**
 * The World view's map dialogs — New map, Delete map.
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
  /** The Tiles + Floor answer; absent when the project has no tileset. */
  ground?: MapGround
}

/** A tileset the Tiles row offers, with the pictures its Floor row shows. */
export interface TilesetChoice {
  ref: SpriteSetReference
  name: string
  /** One tile standing for the whole set. */
  preview: Gdk.Paintable | null
  floors: readonly { spriteId: number; paintable: Gdk.Paintable }[]
}

/** A starter pack the dialog offers while the project has no tileset. */
export interface StarterOffer {
  id: string
  name: string
  preview: Gdk.Paintable | null
}

/** Side of a Tiles / Floor picture, px — big enough for a fingertip. */
const PICK_SIZE = 56

/** A flat toggle holding a picture (and optionally a caption). */
function pickButton(paintable: Gdk.Paintable | null, caption: string | null, tooltip: string): Gtk.ToggleButton {
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, halign: Gtk.Align.CENTER })
  const image = paintable ? Gtk.Image.new_from_paintable(paintable) : new Gtk.Image()
  image.set_pixel_size(PICK_SIZE)
  box.append(image)
  if (caption) {
    const label = new Gtk.Label({ label: caption, ellipsize: 3, maxWidthChars: 10 })
    label.add_css_class('caption')
    box.append(label)
  }
  const button = new Gtk.ToggleButton({ child: box, tooltipText: tooltip })
  button.add_css_class('flat')
  return button
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
 * Tiles picks the tileset the map paints with (the one the open map
 * uses is preselected) and Floor the tile that fills the ground, or
 * Empty. A project with no tileset shows the starter packs instead;
 * tapping one adds it and turns the row into the normal Tiles choice.
 *
 * `onCreate` runs with a trimmed, non-empty name; cancelling calls
 * nothing.
 */
export function presentNewMapDialog(
  parent: Gtk.Widget,
  options: {
    suggestedName: string
    fullView: boolean
    tilesets: readonly TilesetChoice[]
    selectedTilesetId: string | null
    starterOffers: readonly StarterOffer[]
    addStarterPack: (packId: string) => Promise<TilesetChoice | null>
  },
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

  // Tiles + Floor. `tilesets` grows when a starter pack is added.
  const tilesets: TilesetChoice[] = [...options.tilesets]
  let tilesetId = tilesets.find((t) => t.ref.id === options.selectedTilesetId)?.ref.id ?? tilesets[0]?.ref.id ?? null
  let floorSpriteId: number | undefined

  const tilesGroup = new Adw.PreferencesGroup({ title: _('Tiles') })
  const floorGroup = new Adw.PreferencesGroup({ title: _('Floor') })
  const rowOf = (): Gtk.Box => new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
  const scroller = (child: Gtk.Widget): Gtk.ScrolledWindow =>
    new Gtk.ScrolledWindow({
      child,
      hscrollbarPolicy: Gtk.PolicyType.AUTOMATIC,
      vscrollbarPolicy: Gtk.PolicyType.NEVER,
      propagateNaturalHeight: true,
    })

  const buildFloor = () => {
    const set = tilesets.find((t) => t.ref.id === tilesetId)
    floorGroup.set_visible(set != null)
    if (!set) return
    const row = rowOf()
    const empty = pickButton(null, _('Empty'), _('Empty'))
    row.append(empty)
    const choices: [Gtk.ToggleButton, number | undefined][] = [[empty, undefined]]
    for (const floor of set.floors) {
      const button = pickButton(floor.paintable, null, _('Floor tile'))
      button.set_group(empty)
      row.append(button)
      choices.push([button, floor.spriteId])
    }
    empty.set_active(true)
    floorSpriteId = undefined
    for (const [button, id] of choices) {
      button.connect('toggled', () => {
        if (button.get_active()) floorSpriteId = id
      })
    }
    // Replace the previous row.
    let child = floorGroupBox.get_first_child()
    while (child) {
      floorGroupBox.remove(child)
      child = floorGroupBox.get_first_child()
    }
    floorGroupBox.append(scroller(row))
  }
  const floorGroupBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  floorGroup.add(floorGroupBox)

  const buildTiles = () => {
    let child = tilesGroupBox.get_first_child()
    while (child) {
      tilesGroupBox.remove(child)
      child = tilesGroupBox.get_first_child()
    }
    const row = rowOf()
    if (tilesets.length > 0) {
      let first: Gtk.ToggleButton | null = null
      for (const set of tilesets) {
        const button = pickButton(set.preview, set.name, set.name)
        if (first) button.set_group(first)
        else first = button
        button.set_active(set.ref.id === tilesetId)
        button.connect('toggled', () => {
          if (!button.get_active() || tilesetId === set.ref.id) return
          tilesetId = set.ref.id
          buildFloor()
        })
        row.append(button)
      }
    } else {
      // Nothing to pick yet: one tap on a pack adds it and the row becomes the choice above.
      for (const offer of options.starterOffers) {
        const button = pickButton(offer.preview, offer.name, _('Add %s').replace('%s', offer.name))
        button.connect('clicked', () => {
          button.set_sensitive(false)
          void options.addStarterPack(offer.id).then((added) => {
            if (!added) {
              button.set_sensitive(true)
              return
            }
            tilesets.push(added)
            tilesetId = added.ref.id
            buildTiles()
            buildFloor()
          })
        })
        row.append(button)
      }
    }
    tilesGroupBox.append(scroller(row))
    tilesGroup.set_visible(tilesets.length > 0 || options.starterOffers.length > 0)
  }
  const tilesGroupBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL })
  tilesGroup.add(tilesGroupBox)
  buildTiles()
  buildFloor()

  const body = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12 })
  body.append(nameGroup)
  body.append(sizeGroup)
  body.append(tilesGroup)
  body.append(floorGroup)
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
    const set = tilesets.find((t) => t.ref.id === tilesetId)
    onCreate({
      name,
      size: chosenSize(),
      ground: set ? { spriteSet: set.ref, floorSpriteId } : undefined,
    })
  })

  dialog.present(parent)
  // After `present`, so the entry already has focus to select within.
  nameRow.select_region(0, -1)
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
