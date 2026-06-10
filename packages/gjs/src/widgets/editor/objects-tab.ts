import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import Pango from '@girs/pango-1.0'
import { gettext as _ } from 'gettext'

import Template from './objects-tab.blp'

/** One pickable placement brush — a library object the user can stamp. */
export interface BrushOption {
  /** Library entity id. */
  id: string
  /** Display name. */
  name: string
  /**
   * Sprite thumbnail (the object's `visual` component resolved to a
   * paintable). Falls back to {@link icon} when absent.
   */
  paintable?: Gdk.Paintable | null
  /** Symbolic fallback icon when no paintable is available. */
  icon?: string
}

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
 * Top: a **placement-brush palette** — a wrapping grid of library-object
 * cards (sprite thumbnail + name). Single-clicking a card emits
 * `brush-selected::<id>` (empty = the "(None)" card) so the host arms the
 * Object tool via `win.set-object-brush`; the user then clicks the canvas
 * to stamp it. The armed brush is highlighted + preserved across rebuilds.
 *
 * Below: one `Adw.ActionRow` per object PLACEMENT on the active scene
 * (sprite/kind icon, name, tile coordinates); selection emits
 * `object-selected::<id>`. The empty state ("No objects yet") shows when
 * the scene has no placements.
 *
 * Drag-to-place is a follow-up (see TODO.md); the footer's "New object"
 * button seeds a library entry via `win.new-object`.
 */
export class ObjectsTab extends Adw.Bin {
  declare _list: Gtk.ListBox
  declare _empty_state: Gtk.Box
  declare _new_object_button: Gtk.Button
  declare _brush_section: Gtk.Box
  declare _brush_palette: Gtk.FlowBox

  private _activeId: string | null = null
  /** The currently-armed brush id (`null` = none), preserved across rebuilds. */
  private _armedBrushId: string | null = null
  /** Guards `setActiveBrush` / rebuild from re-emitting `brush-selected`. */
  private _silentBrush = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgObjectsTab',
        Template,
        InternalChildren: ['list', 'empty_state', 'new_object_button', 'brush_section', 'brush_palette'],
        Signals: {
          'object-selected': { param_types: [GObject.TYPE_STRING] },
          // A library object was chosen as the placement brush (empty = none).
          'brush-selected': { param_types: [GObject.TYPE_STRING] },
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
    // Single-click a palette card to arm that brush; the "(None)" card
    // disarms. `child-activated` fires on a single click (the FlowBox is
    // `activate-on-single-click`) + on keyboard activate.
    this._brush_palette.connect('child-activated', (_fb: Gtk.FlowBox, child: Gtk.FlowBoxChild) => {
      const id = (child as Gtk.FlowBoxChild & { brushId?: string }).brushId ?? ''
      this._armedBrushId = id || null
      if (!this._silentBrush) this.emit('brush-selected', id)
    })
  }

  /**
   * Populate the placement-brush palette with the project's library
   * objects — a wrapping grid of cards (sprite thumbnail + name) the user
   * single-clicks to arm a brush, then stamps on the canvas with the
   * Object tool. A leading "(None)" card disarms. Hidden when there are no
   * objects to place. The armed brush is preserved across rebuilds.
   */
  setBrushOptions(objects: ReadonlyArray<BrushOption>): void {
    let child = this._brush_palette.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._brush_palette.remove(child)
      child = next
    }
    this._brush_palette.append(this._buildBrushCard({ id: '', name: _('None'), icon: 'edit-clear-symbolic' }))
    for (const obj of objects) this._brush_palette.append(this._buildBrushCard(obj))
    this._brush_section.set_visible(objects.length > 0)
    // Re-arm the previous brush if it still exists, else fall back to None.
    if (this._armedBrushId && !objects.some((o) => o.id === this._armedBrushId)) this._armedBrushId = null
    this._reselectArmedBrush()
  }

  /** Build one palette card: a sprite thumbnail (or icon) above a name label. */
  private _buildBrushCard(opt: BrushOption): Gtk.FlowBoxChild {
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 4,
      marginTop: 6,
      marginBottom: 6,
      marginStart: 6,
      marginEnd: 6,
      halign: Gtk.Align.CENTER,
    })
    let thumb: Gtk.Widget
    if (opt.paintable) {
      const picture = new Gtk.Picture({
        paintable: opt.paintable,
        contentFit: Gtk.ContentFit.SCALE_DOWN,
        widthRequest: 44,
        heightRequest: 44,
      })
      picture.add_css_class('object-sprite-preview')
      thumb = picture
    } else {
      thumb = new Gtk.Image({ iconName: opt.icon ?? FALLBACK_ICON, pixelSize: 28 })
      thumb.add_css_class('dim-label')
    }
    thumb.set_halign(Gtk.Align.CENTER)
    box.append(thumb)
    box.append(
      new Gtk.Label({
        label: opt.name,
        ellipsize: Pango.EllipsizeMode.END,
        maxWidthChars: 9,
        justify: Gtk.Justification.CENTER,
        cssClasses: ['caption'],
      }),
    )
    const child = new Gtk.FlowBoxChild({ child: box })
    ;(child as Gtk.FlowBoxChild & { brushId?: string }).brushId = opt.id
    return child
  }

  /** Highlight the card matching `_armedBrushId` without re-emitting. */
  private _reselectArmedBrush(): void {
    this._silentBrush = true
    let child = this._brush_palette.get_first_child()
    while (child) {
      const id = (child as Gtk.FlowBoxChild & { brushId?: string }).brushId ?? ''
      if ((id || null) === this._armedBrushId) {
        this._brush_palette.select_child(child as Gtk.FlowBoxChild)
        this._silentBrush = false
        return
      }
      child = child.get_next_sibling()
    }
    this._brush_palette.unselect_all()
    this._silentBrush = false
  }

  /**
   * Programmatically arm a brush by id (`null`/`''` = none) — e.g. when the
   * host re-syncs after a tool change. Highlights the matching card without
   * re-emitting `brush-selected`.
   */
  setActiveBrush(id: string | null): void {
    this._armedBrushId = id || null
    this._reselectArmedBrush()
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
