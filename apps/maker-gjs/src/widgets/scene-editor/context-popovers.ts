import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { type LayerDescriptor, type TileDescriptor, TilePalette } from '@pixelrpg/gjs'
import type { ObjectBrushOption } from './object-descriptors.ts'

/** The popover shell every context popover shares: padded box + dim heading. */
function popoverShell(heading: string): { popover: Gtk.Popover; box: Gtk.Box } {
  const popover = new Gtk.Popover()
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    margin_top: 8,
    margin_bottom: 8,
    margin_start: 8,
    margin_end: 8,
  })
  const label = new Gtk.Label({ label: heading, halign: Gtk.Align.START })
  label.add_css_class('caption-heading')
  label.add_css_class('dim-label')
  box.append(label)
  popover.set_child(box)
  return { popover, box }
}

function paletteScroller(palette: TilePalette): Gtk.ScrolledWindow {
  const scrolled = new Gtk.ScrolledWindow({
    hscrollbar_policy: Gtk.PolicyType.NEVER,
    vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    min_content_height: 240,
    min_content_width: 280,
  })
  scrolled.set_child(palette)
  return scrolled
}

/** What the tile popover renders. */
export interface TilePopoverOptions {
  tilesetName: string
  tiles: readonly TileDescriptor[]
  /** Local sheet index of the active tile, or `null` when there is none. */
  activeIndex: number | null
}

/** The tile grid behind the top bar's context chip. */
export function buildTilePopover(options: TilePopoverOptions, onSelect: (tileId: number) => void): Gtk.Popover {
  const { popover, box } = popoverShell(options.tilesetName || 'Tileset')
  const palette = new TilePalette({ tileSize: 32, columns: 6, tiles: [...options.tiles] })
  if (options.activeIndex != null) palette.selectTile(options.activeIndex)
  palette.connect('tile-selected', (_p, id) => onSelect(id))
  box.append(paletteScroller(palette))
  return popover
}

/** What the object popover renders. */
export interface ObjectPopoverOptions {
  brushes: readonly ObjectBrushOption[]
  /** The currently armed brush's definition id, or `null`. */
  armedId: string | null
}

/**
 * The Object tool's counterpart to {@link buildTilePopover}: the same
 * palette grid fed with the placeable library objects (shared swatch
 * rendering — sprite or marker colour, framed).
 */
export function buildObjectPopover(options: ObjectPopoverOptions, onSelect: (defId: string) => void): Gtk.Popover {
  const { popover, box } = popoverShell('Objects')

  if (options.brushes.length === 0) {
    const empty = new Gtk.Label({ label: 'No objects in the library yet' })
    empty.add_css_class('dim-label')
    box.append(empty)
    return popover
  }

  const palette = new TilePalette({ tileSize: 32, columns: 6 })
  palette.aspectMode = 'contain'
  palette.add_css_class('object-brush-palette')
  palette.setTiles(
    options.brushes.map((b, idx) => ({ id: idx, name: b.name, color: b.color, paintable: b.paintable ?? undefined })),
  )
  const armedIdx = options.armedId ? options.brushes.findIndex((b) => b.id === options.armedId) : -1
  if (armedIdx >= 0) palette.selectTile(armedIdx)
  palette.connect('tile-selected', (_p, idx: number) => {
    const brush = options.brushes[idx]
    if (brush) onSelect(brush.id)
  })
  box.append(paletteScroller(palette))
  return popover
}

/** What the layer popover renders. */
export interface LayerPopoverOptions {
  layers: readonly LayerDescriptor[]
  /** The active layer's id, or `null` when there is none. */
  activeId: string | null
}

/** The active-layer list behind the top bar's layer chip. */
export function buildLayerPopover(options: LayerPopoverOptions, onSelect: (layerId: string) => void): Gtk.Popover {
  const { popover, box } = popoverShell('Active layer')

  const list = new Gtk.ListBox({
    selection_mode: Gtk.SelectionMode.SINGLE,
    // GtkListBox only fires `row-activated` on single-click when this
    // flag is set. Without it, single-click only *selects* — which is
    // what `LayersTab` listens for, but here we want to commit and
    // dismiss the popover in one click.
    activate_on_single_click: true,
    css_classes: ['boxed-list'],
  })
  list.set_size_request(240, -1)
  for (const layer of options.layers) {
    const row = new Adw.ActionRow({ title: layer.name, subtitle: `${layer.tileCount} tiles`, activatable: true })
    ;(row as Adw.ActionRow & { layerId?: string }).layerId = layer.id
    list.append(row)
  }
  if (options.activeId) {
    const idx = options.layers.findIndex((l) => l.id === options.activeId)
    if (idx >= 0) {
      const target = list.get_row_at_index(idx)
      if (target) list.select_row(target)
    }
  }
  list.connect('row-activated', (_l, row) => {
    const id = (row as Gtk.ListBoxRow & { layerId?: string }).layerId
    if (id) {
      onSelect(id)
      popover.popdown()
    }
  })
  box.append(list)
  return popover
}
