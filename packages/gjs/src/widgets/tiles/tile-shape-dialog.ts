import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { gettext as _, ngettext } from 'gettext'

import { type ColliderShape, shapeBounds, type TilePixelSize } from '@pixelrpg/engine'

import type { GdkSprite } from '../../sprite/index.ts'
import { SignalScope } from '../../utils/signal-scope.ts'
import { type ShapeTool, TileShapeCanvas } from './tile-shape-canvas.ts'

import Template from './tile-shape-dialog.blp'

export interface TileShapeDialogSignals extends Adw.Dialog.SignalSignatures {
  /** "Save" — the shapes to write to `definition.colliders`. */
  'shapes-saved': (shapes: ColliderShape[]) => void
}

/** What to do with each tool, shown under the tool group. */
const TOOL_HINTS: Record<ShapeTool, () => string> = {
  rectangle: () => _('Drag across the tile to place a rectangle.'),
  polygon: () => _('Click each corner, then click the first one again to close the outline.'),
  circle: () => _('Drag from the centre outwards to place a circle.'),
}

/**
 * The free-form half of per-tile collision (REDESIGN § 6.4): draw the
 * exact parts of a tile the hero bumps into, on the tile magnified.
 *
 * Reached from the tile inspector's "Draw a shape…" button, which only
 * exists in Full view — the pictograms cover every shape that fits in a
 * narrow pane, and this is the one surface that wants room.
 *
 * Two deliberate restraints:
 *
 *  - **Nothing is seeded.** Opening on a Wall tile starts with an empty
 *    list, not a full-tile rectangle. A Wall is `solid: true` with no
 *    colliders; writing the equivalent rectangle would classify it as
 *    `Custom` from then on and quietly take it out of the pictograms'
 *    hands.
 *  - **Save stays insensitive while the list is empty**, for the same
 *    reason in the other direction: "no shapes" is the Free/Wall
 *    pictograms' answer, not this dialog's.
 *
 * Presentation-only — it emits the shape list and the host persists it,
 * the way {@link NewCharacterDialog} hands over a draft.
 */
export class TileShapeDialog extends Adw.Dialog {
  declare _cancel_button: Gtk.Button
  declare _save_button: Gtk.Button
  declare _canvas: TileShapeCanvas
  declare _tool_group: Adw.ToggleGroup
  declare _hint_label: Gtk.Label
  declare _shape_stack: Gtk.Stack
  declare _shape_list: Gtk.ListBox
  declare _clear_button: Gtk.Button

  private _tileSize: TilePixelSize = { width: 16, height: 16 }
  private _rows: Adw.ActionRow[] = []
  private _signals = new SignalScope()

  static {
    GObject.type_ensure(TileShapeCanvas.$gtype)
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTileShapeDialog',
        Template,
        InternalChildren: [
          'cancel_button',
          'save_button',
          'canvas',
          'tool_group',
          'hint_label',
          'shape_stack',
          'shape_list',
          'clear_button',
        ],
        Signals: {
          'shapes-saved': { param_types: [GObject.TYPE_JSOBJECT] },
        },
      },
      TileShapeDialog,
    )
  }

  declare connect: GObject.SignalMethods<this, TileShapeDialogSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, TileShapeDialogSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, TileShapeDialogSignals>['emit']

  constructor() {
    super()
    this._tool_group.active_name = 'rectangle'
  }

  /**
   * Load the tile to draw on.
   *
   * `shapes` are the tile's current colliders — the ones a previous
   * visit here (or the Tiled porter) wrote. A pictogram preset's
   * generated rectangle is NOT among them unless it was actually
   * stored; see the class note on seeding.
   */
  setTile(sprite: GdkSprite | null, tileSize: TilePixelSize, shapes: readonly ColliderShape[], title: string): void {
    this._tileSize = tileSize
    this.set_title(title)
    this._canvas.setTile(sprite, tileSize, shapes)
    this._refreshShapes()
  }

  vfunc_map(): void {
    super.vfunc_map()
    this._signals.connect(this._cancel_button, 'clicked', () => this.close())
    this._signals.connect(this._save_button, 'clicked', () => this._onSave())
    this._signals.connect(this._clear_button, 'clicked', () => this._canvas.clearShapes())
    this._signals.connect(this._canvas, 'shapes-changed', () => this._refreshShapes())
    this._signals.connect(this._tool_group, 'notify::active-name', () => this._onToolChanged())
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    super.vfunc_unmap()
  }

  private _onSave(): void {
    const shapes = this._canvas.shapes
    if (shapes.length === 0) return
    this.emit('shapes-saved', shapes)
    this.close()
  }

  private _onToolChanged(): void {
    const name = this._tool_group.active_name
    if (name !== 'rectangle' && name !== 'polygon' && name !== 'circle') return
    this._canvas.tool = name
    this._hint_label.label = TOOL_HINTS[name]()
  }

  /** Rebuild the list from the canvas's draft — the single source. */
  private _refreshShapes(): void {
    const shapes = this._canvas.shapes
    for (const row of this._rows) this._shape_list.remove(row)
    this._rows = []

    shapes.forEach((shape, index) => {
      const row = new Adw.ActionRow({ title: this._shapeTitle(shape), subtitle: this._shapeSubtitle(shape) })
      const remove = new Gtk.Button({
        icon_name: 'user-trash-symbolic',
        tooltip_text: _('Remove this shape'),
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
      })
      remove.connect('clicked', () => this._canvas.removeShape(index))
      row.add_suffix(remove)
      this._shape_list.append(row)
      this._rows.push(row)
    })

    this._shape_stack.visible_child_name = shapes.length === 0 ? 'empty' : 'populated'
    this._save_button.sensitive = shapes.length > 0
    this._clear_button.sensitive = shapes.length > 0
  }

  private _shapeTitle(shape: ColliderShape): string {
    if (shape.type === 'rectangle') {
      // Translators: the dimensions of a rectangular collider, in tile pixels.
      return _('Rectangle %d × %d').replace('%d', String(shape.width)).replace('%d', String(shape.height))
    }
    if (shape.type === 'circle') {
      // Translators: the radius of a circular collider, in tile pixels.
      return _('Circle, radius %d').replace('%d', String(shape.radius))
    }
    const corners = shape.points.length
    return ngettext('Polygon, %d corner', 'Polygon, %d corners', corners).replace('%d', String(corners))
  }

  /** Where the shape sits, so two look-alike entries are tellable apart. */
  private _shapeSubtitle(shape: ColliderShape): string {
    const bounds = shapeBounds(shape, this._tileSize)
    if (!bounds) return ''
    // Translators: the top-left corner of a collider, in tile pixels.
    return _('at %d, %d').replace('%d', String(bounds.x)).replace('%d', String(bounds.y))
  }
}

GObject.type_ensure(TileShapeDialog.$gtype)
