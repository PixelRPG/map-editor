import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Template from './objects-tab.blp'
import { createSwatchWidget } from './tile-palette'

/** Editor-side description of a single object placement. */
export interface ObjectDescriptor {
  /** Placement id (unique within the map). */
  id: string
  /** Display name — comes from the resolved definition. */
  name: string
  /**
   * Symbolic icon shown when no sprite is available — the host derives it
   * from the entity's components (the dominant component's editor icon).
   * Falls back to {@link FALLBACK_ICON} when absent.
   */
  icon?: string
  /** Tile-grid position, surfaced as a "(x, y)" caption. */
  tileX: number
  tileY: number
  /** Layer the placement is sorted under — shown as a tag. */
  layerId: string
  /**
   * Optional sprite preview. When supplied, the row renders this
   * paintable as its prefix instead of the {@link icon} symbolic icon —
   * useful for placements with an actual sprite. Falls back to the icon
   * when `null` / unavailable.
   */
  paintable?: Gdk.Paintable | null
  /**
   * Solid fallback swatch colour (the def's marker colour) — used when
   * no paintable resolves, so the row prefix matches the type-coloured
   * marker the placement shows on the map. Falls back to {@link icon}.
   */
  color?: string
}

/** Symbolic icon used when a placement supplies neither a paintable, a colour, nor an icon. */
const FALLBACK_ICON = 'view-grid-symbolic'

/**
 * Inspector's "Objects" tab — a pure list of the objects PLACED on the
 * active scene: one `Adw.ActionRow` per placement (tile-like sprite
 * swatch, name, tile coordinates); selection emits
 * `object-selected::<id>`. The empty state ("No objects yet") shows when
 * the scene has no placements.
 *
 * Placement BRUSHES live in the Tiles tab's Objects grid (shared
 * `TilePalette`), so picking what to place feels exactly like picking a
 * tile. The footer's "New object" button seeds a library entry via
 * `win.new-object`.
 */
export class ObjectsTab extends Adw.Bin {
  declare _list: Gtk.ListBox
  declare _empty_state: Gtk.Box
  declare _new_object_button: Gtk.Button

  private _activeId: string | null = null
  /** Guards {@link selectObject} from re-emitting `object-selected`. */
  private _silentSelect = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgObjectsTab',
        Template,
        InternalChildren: ['list', 'empty_state', 'new_object_button'],
        Signals: {
          'object-selected': { param_types: [GObject.TYPE_STRING] },
        },
      },
      ObjectsTab,
    )
  }

  constructor() {
    super()
    this._list.connect('row-selected', (_list, row) => {
      if (!row) return
      const id = (row as Gtk.ListBoxRow & { objectId?: string }).objectId
      if (!id || id === this._activeId) return
      this._activeId = id
      if (!this._silentSelect) this.emit('object-selected', id)
    })
  }

  /**
   * Replace the rendered list with `placements`. Switches the
   * empty-state ↔ list visibility based on length. Selection is
   * cleared — callers wanting to restore the previously-selected
   * id should call {@link selectObject} afterwards.
   */
  setObjects(placements: ObjectDescriptor[]): void {
    // Remove all existing rows. ListBox doesn't have a clear() so
    // we walk children explicitly.
    let row = this._list.get_first_child()
    while (row) {
      const next = row.get_next_sibling()
      this._list.remove(row)
      row = next
    }
    this._activeId = null

    const hasItems = placements.length > 0
    this._empty_state.set_visible(!hasItems)
    this._list.set_visible(hasItems)

    for (const placement of placements) {
      const row = new Adw.ActionRow({
        title: placement.name,
        subtitle: `(${placement.tileX}, ${placement.tileY}) · ${placement.layerId}`,
        activatable: true,
      })
      row.add_prefix(this._buildPrefix(placement))
      ;(row as Adw.ActionRow & { objectId?: string }).objectId = placement.id
      this._list.append(row)
    }
  }

  /**
   * Build the prefix widget shown to the left of an object row's
   * title: the SAME swatch renderer the tile/object palettes use
   * (`createSwatchWidget`), framed via the `object-swatch` style —
   * so a placement looks identical here, in the Tiles tab's Objects
   * grid, and (engine-side) on the map. Sprite paintable → contain-fit
   * picture; no sprite → the def's marker colour; neither → kind icon.
   */
  private _buildPrefix(placement: ObjectDescriptor): Gtk.Widget {
    if (!placement.paintable && !placement.color) {
      return new Gtk.Image({
        icon_name: placement.icon ?? FALLBACK_ICON,
        pixel_size: 18,
      })
    }
    const swatch = createSwatchWidget(placement, 28, 28, 'contain')
    swatch.add_css_class('object-swatch')
    // Keep the swatch square — without this the prefix stretches to the
    // full ActionRow height (visible on the solid-colour fallbacks).
    swatch.set_valign(Gtk.Align.CENTER)
    return swatch
  }

  /**
   * Programmatically set the active object (canvas select-tool sync).
   * Does NOT re-emit `object-selected` — the engine-side selection is
   * already in place, so re-emitting would bounce a `focusOnPlacement`
   * camera pan back at every canvas click. Scrolls the row into view so
   * the selection is visible in long placement lists. No-op if the id
   * isn't present.
   */
  selectObject(id: string | null): void {
    if (id === this._activeId) return
    this._silentSelect = true
    try {
      let row = this._list.get_first_child()
      while (row) {
        const objId = (row as Gtk.ListBoxRow & { objectId?: string }).objectId
        if (objId === id) {
          this._list.select_row(row as Gtk.ListBoxRow)
          this._activeId = id
          this._scrollRowIntoView(row as Gtk.ListBoxRow)
          return
        }
        row = row.get_next_sibling()
      }
      this._list.unselect_all()
      this._activeId = null
    } finally {
      this._silentSelect = false
    }
  }

  /**
   * Scroll an off-screen row into the inspector's viewport (centred).
   * The list lives inside the RightInspector's ScrolledWindow (implicit
   * `Gtk.Viewport`); we position the vadjustment manually from the
   * row's bounds — `Gtk.Viewport.scroll_to` proved unreliable across
   * the ViewStack nesting — and defer to an idle so the row's
   * allocation is valid even when the tab was just switched in.
   */
  private _scrollRowIntoView(row: Gtk.ListBoxRow): void {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      const viewport = row.get_ancestor(Gtk.Viewport.$gtype) as Gtk.Viewport | null
      const content = viewport?.get_child()
      if (!viewport || !content) return GLib.SOURCE_REMOVE
      const [ok, bounds] = row.compute_bounds(content)
      if (!ok) return GLib.SOURCE_REMOVE
      const adj = viewport.vadjustment
      if (!adj) return GLib.SOURCE_REMOVE
      const target = bounds.get_y() - (adj.get_page_size() - bounds.get_height()) / 2
      adj.set_value(Math.max(adj.get_lower(), Math.min(target, adj.get_upper() - adj.get_page_size())))
      return GLib.SOURCE_REMOVE
    })
  }
}

GObject.type_ensure(ObjectsTab.$gtype)
