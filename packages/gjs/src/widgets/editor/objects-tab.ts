import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

import Template from './objects-tab.blp'

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
}

/** Symbolic icon used when a placement supplies neither a paintable nor an icon. */
const FALLBACK_ICON = 'view-grid-symbolic'

/**
 * Inspector's "Objects" tab.
 *
 * Read-only for now — renders one `Adw.ActionRow` per object
 * placement on the active scene with the kind icon, name, and
 * tile coordinates. Selection emits `object-selected::<id>` so
 * downstream UI (a future placement editor) can react.
 *
 * The empty state ("No objects yet") shows when the active scene
 * has no placements — the editor's first-run experience until the
 * user drops an object onto the map.
 *
 * Drag-to-create is a follow-up (see TODO.md). For now the
 * footer's "New object" button is wired to `win.new-object`
 * which the application can hook up when the placement flow lands.
 */
export class ObjectsTab extends Adw.Bin {
  declare _list: Gtk.ListBox
  declare _empty_state: Gtk.Box
  declare _new_object_button: Gtk.Button

  private _activeId: string | null = null

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
      this.emit('object-selected', id)
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
   * title. Prefers the placement's `paintable` (the resolved sprite
   * thumbnail) and falls back to the kind icon when no paintable is
   * available — that way placements without an attached sprite
   * still get a recognisable kind-specific badge.
   *
   * The sprite is rendered through a `Gtk.Picture` sized to roughly
   * match the kind icon's footprint so rows stay vertically aligned.
   * Pixel-art sprites stay crisp via `content-fit: scale-down` —
   * smaller sprites render at native size + a transparent border,
   * larger ones scale down preserving aspect.
   */
  private _buildPrefix(placement: ObjectDescriptor): Gtk.Widget {
    if (placement.paintable) {
      const picture = new Gtk.Picture({
        paintable: placement.paintable,
        content_fit: Gtk.ContentFit.SCALE_DOWN,
        width_request: 28,
        height_request: 28,
      })
      picture.add_css_class('object-sprite-preview')
      return picture
    }
    return new Gtk.Image({
      icon_name: placement.icon ?? FALLBACK_ICON,
      pixel_size: 18,
    })
  }

  /** Programmatically set the active object. No-op if id not present. */
  selectObject(id: string | null): void {
    if (id === this._activeId) return
    let row = this._list.get_first_child()
    while (row) {
      const objId = (row as Gtk.ListBoxRow & { objectId?: string }).objectId
      if (objId === id) {
        this._list.select_row(row as Gtk.ListBoxRow)
        this._activeId = id
        return
      }
      row = row.get_next_sibling()
    }
    this._list.unselect_all()
    this._activeId = null
  }
}

GObject.type_ensure(ObjectsTab.$gtype)
