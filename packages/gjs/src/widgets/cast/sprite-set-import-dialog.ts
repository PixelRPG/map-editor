import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { iterateSpriteGrid, type SpriteDataSet, type SpriteSetData, type SpriteSetKind } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import { GdkImageTexture, GdkSpriteSheet } from '../../sprite/index.ts'
import { reparentWidget } from '../../utils/index.ts'
import { SignalScope } from '../../utils/signal-scope.ts'
import { TilePalette } from '../editor/tile-palette.ts'
import { CollisionPreview } from './collision-preview.ts'
import {
  cellOrigin,
  colliderBound,
  gridDimensions,
  isUsableGrid,
  slugifySpriteSetName,
  type SpriteGrid,
} from './sprite-set-import.model.ts'

import Template from './sprite-set-import-dialog.blp'

// Referenced as `$PixelRpgTilePalette` / `$PixelRpgCollisionPreview` in
// the template — ensure both gtypes exist before the template parses.
GObject.type_ensure(TilePalette.$gtype)
GObject.type_ensure(CollisionPreview.$gtype)

/** What {@link SpriteSetImportDialog} hands back on "Import". */
export interface SpriteSetImportResult {
  /** Fully-assembled sprite-set descriptor (provisional id; the caller may rename). */
  data: SpriteSetData
  /** Absolute path of the source image the user picked — the caller copies it into the project. */
  sourcePath: string
}

/**
 * Dialog for importing a sprite sheet into the project. The user picks
 * a PNG, declares the uniform sprite size (every sprite in the image
 * is the same size), and marks the collision box that applies to every
 * sprite. A live grid shows the image sliced at the chosen size, and a
 * zoomed cell preview shows the collision box.
 *
 * Presentation-only: it loads the picked image into a `Gdk.Texture`
 * for the preview, but doesn't copy files or touch the project. On
 * "Import" it emits `spriteset-imported` with the assembled
 * {@link SpriteSetData} + the source path; the host controller does the
 * file copy + project registration (mirrors how {@link AddAnimationDialog}
 * emits data the cast controller persists).
 *
 * Responsive: ≥720sp puts the settings column beside the grid; narrower
 * stacks them and libadwaita presents the dialog as a bottom sheet.
 */
export class SpriteSetImportDialog extends Adw.Dialog {
  declare _cancel_button: Gtk.Button
  declare _import_button: Gtk.Button
  declare _name_row: Adw.EntryRow
  declare _file_row: Adw.ActionRow
  declare _choose_button: Gtk.Button
  declare _width_row: Adw.SpinRow
  declare _height_row: Adw.SpinRow
  declare _grid_row: Adw.ActionRow
  declare _collision_row: Adw.SwitchRow
  declare _collider_x_row: Adw.SpinRow
  declare _collider_y_row: Adw.SpinRow
  declare _collider_w_row: Adw.SpinRow
  declare _collider_h_row: Adw.SpinRow
  declare _size_group: Adw.PreferencesGroup
  declare _collision_group: Adw.PreferencesGroup
  declare _collision_preview: CollisionPreview
  declare _palette: TilePalette
  // Responsive preview placement: `preview_block` is reparented between
  // `phone_preview_slot` (under the file picker) and `desktop_preview_slot`
  // (right column) by the `desktop_breakpoint` apply/unapply signals.
  declare _desktop_breakpoint: Adw.Breakpoint
  declare _preview_block: Gtk.Box
  declare _phone_preview_slot: Gtk.Box
  declare _desktop_preview_slot: Gtk.Box

  private _texture: Gdk.Texture | null = null
  private _sourcePath: string | null = null
  private _selectedCell = 0
  private _imageName = _('No file chosen')
  private _gridSummary = '—'
  /** Guard so programmatic spin updates don't re-trigger their own handlers. */
  private _syncing = false
  // What's being imported. Drives the title, wording, and whether the
  // shared-collision section is shown: a character sprite sheet shares
  // ONE collision box across its frames; a tileset's collision is
  // per-tile (set later in the Tiles inspector), so it has no box here.
  private _kind: SpriteSetKind = 'character'
  private _signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgSpriteSetImportDialog',
        Template,
        InternalChildren: [
          'cancel_button',
          'import_button',
          'name_row',
          'file_row',
          'choose_button',
          'width_row',
          'height_row',
          'grid_row',
          'collision_row',
          'collider_x_row',
          'collider_y_row',
          'collider_w_row',
          'collider_h_row',
          'size_group',
          'collision_group',
          'collision_preview',
          'palette',
          'desktop_breakpoint',
          'preview_block',
          'phone_preview_slot',
          'desktop_preview_slot',
        ],
        Properties: {
          'image-name': GObject.ParamSpec.string(
            'image-name',
            'Image Name',
            'Basename of the chosen image, shown in the file row subtitle',
            GObject.ParamFlags.READWRITE,
            'No file chosen',
          ),
          'grid-summary': GObject.ParamSpec.string(
            'grid-summary',
            'Grid Summary',
            'Human summary of the sliced grid (e.g. `6 × 5 sprites`)',
            GObject.ParamFlags.READWRITE,
            '—',
          ),
        },
        Signals: {
          'spriteset-imported': { param_types: [GObject.TYPE_JSOBJECT] },
        },
      },
      SpriteSetImportDialog,
    )
  }

  constructor() {
    super()
    this._refreshGrid()
    this._refreshValidity()
    this._applyKind()
  }

  vfunc_map(): void {
    super.vfunc_map?.()
    this._wireButtons()
    this._wireInputs()
    // Desktop (≥720sp): preview beside the settings. Phone: preview under
    // the file picker (its blp home). apply/unapply only fire on a
    // transition, so the initial phone layout needs no action.
    this._signals.connect(this._desktop_breakpoint, 'apply', () => this._movePreview(this._desktop_preview_slot))
    this._signals.connect(this._desktop_breakpoint, 'unapply', () => this._movePreview(this._phone_preview_slot))
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    super.vfunc_unmap?.()
  }

  /** What's being imported. Callers set this to tailor the dialog to its domain. */
  get kind(): SpriteSetKind {
    return this._kind
  }

  set kind(value: SpriteSetKind) {
    if (this._kind === value) return
    this._kind = value
    this._applyKind()
  }

  /**
   * Tailor the (shared) dialog to its kind: title + "sprite"/"tile"
   * wording, and hide the shared-collision section for tilesets (their
   * collision is per-tile, set in the Tiles inspector after import).
   */
  private _applyKind(): void {
    const isCharacter = this._kind === 'character'
    this.set_title(isCharacter ? _('Import appearance') : _('Import tileset'))
    this._size_group.set_title(isCharacter ? _('Sprite size') : _('Tile size'))
    this._size_group.set_description(
      isCharacter
        ? _('Every sprite in the image is the same size. The image is sliced into a grid using this size.')
        : _('Every tile in the image is the same size. The image is sliced into a grid using this size.'),
    )
    this._collision_group.set_visible(isCharacter)
    this._refreshGrid()
    this._refreshPreview()
  }

  /** Reparent the preview block into `target` (no-op if already there). */
  private _movePreview(target: Gtk.Box): void {
    reparentWidget(this._preview_block, target)
  }

  get imageName(): string {
    return this._imageName ?? _('No file chosen')
  }

  set imageName(value: string) {
    if (this._imageName === value) return
    this._imageName = value
    this.notify('image-name')
  }

  get gridSummary(): string {
    return this._gridSummary ?? '—'
  }

  set gridSummary(value: string) {
    if (this._gridSummary === value) return
    this._gridSummary = value
    this.notify('grid-summary')
  }

  private _wireButtons(): void {
    this._signals.connect(this._cancel_button, 'clicked', () => this.close())
    this._signals.connect(this._import_button, 'clicked', () => {
      const result = this._buildResult()
      if (!result) return
      this.emit('spriteset-imported', result)
      this.close()
    })
    this._signals.connect(this._choose_button, 'clicked', () => this._chooseImage())
  }

  private _wireInputs(): void {
    this._signals.connect(this._name_row, 'changed', () => this._refreshValidity())
    const onSizeChanged = () => {
      if (this._syncing) return
      this._refreshGrid()
      this._refitCollider()
      this._refreshPreview()
      this._refreshValidity()
    }
    for (const row of [this._width_row, this._height_row]) {
      this._signals.connect(row, 'notify::value', onSizeChanged)
    }

    const onColliderChanged = () => {
      if (this._syncing) return
      this._refreshPreview()
    }
    this._signals.connect(this._collision_row, 'notify::active', onColliderChanged)
    for (const row of [this._collider_x_row, this._collider_y_row, this._collider_w_row, this._collider_h_row]) {
      this._signals.connect(row, 'notify::value', onColliderChanged)
    }

    this._signals.connect(this._palette, 'tile-selected', (_p: TilePalette, spriteId: number) => {
      this._selectedCell = spriteId
      this._refreshPreview()
    })
  }

  /** Open a native file picker filtered to images; load the pick into a texture. */
  private _chooseImage(): void {
    const title = this._kind === 'character' ? _('Choose appearance image') : _('Choose tileset image')
    const dialog = new Gtk.FileDialog({ title, modal: true })
    const filter = new Gtk.FileFilter()
    filter.set_name(_('Images'))
    filter.add_mime_type('image/png')
    filter.add_mime_type('image/*')
    filter.add_pattern('*.png')
    const filters = new Gio.ListStore({ item_type: Gtk.FileFilter.$gtype })
    filters.append(filter)
    dialog.set_filters(filters)
    dialog.set_default_filter(filter)

    const parent = this.get_root() as Gtk.Window | null
    dialog.open(parent, null, (_d, result) => {
      try {
        const file = dialog.open_finish(result)
        const path = file?.get_path()
        if (path) this._loadImage(path)
      } catch (error) {
        if (error instanceof Error && !error.message.includes('Dismissed')) {
          console.warn('[SpriteSetImportDialog] file pick failed:', error)
        }
      }
    })
  }

  private _loadImage(path: string): void {
    let texture: Gdk.Texture
    try {
      texture = Gdk.Texture.new_from_file(Gio.File.new_for_path(path))
    } catch (error) {
      console.warn('[SpriteSetImportDialog] failed to load image:', error)
      this.imageName = _('Could not load image')
      return
    }
    this._texture = texture
    this._sourcePath = path
    this.imageName = GLib.path_get_basename(path)
    // Seed the name from the filename (sans extension) if untouched.
    if (this._name_row.get_text().trim().length === 0) {
      const base = GLib.path_get_basename(path).replace(/\.[^.]+$/, '')
      this._name_row.set_text(base)
    }
    this._selectedCell = 0
    // Reset the collider to the full cell on a fresh image.
    this._resetColliderToCell()
    this._refreshGrid()
    this._refreshPreview()
    this._refreshValidity()
  }

  private get _spriteWidth(): number {
    return Math.max(1, Math.round(this._width_row.get_value()))
  }

  private get _spriteHeight(): number {
    return Math.max(1, Math.round(this._height_row.get_value()))
  }

  /** How the current image divides at the chosen sprite size. */
  private _grid(): SpriteGrid {
    if (!this._texture) return { columns: 0, rows: 0 }
    return gridDimensions(this._texture.get_width(), this._texture.get_height(), this._spriteWidth, this._spriteHeight)
  }

  /** Recompute the grid summary + rebuild the sliced-cell palette. */
  private _refreshGrid(): void {
    const grid = this._grid()
    if (!this._texture || !isUsableGrid(grid)) {
      this.gridSummary = this._texture ? _('Sprite larger than the image') : '—'
      this._palette.setTiles([])
      return
    }
    const unit = this._kind === 'character' ? _('sprites') : _('tiles')
    this.gridSummary = `${grid.columns} × ${grid.rows} — ${grid.columns * grid.rows} ${unit}`
    const data = this._buildSpriteSetData(grid, false)
    const sheet = new GdkSpriteSheet(data, GdkImageTexture.fromTexture(this._texture))
    this._palette.setFromSpriteSheet(sheet)
  }

  /** Push the selected cell + collider into the zoomed preview. */
  private _refreshPreview(): void {
    const grid = this._grid()
    if (!this._texture || !isUsableGrid(grid)) {
      this._collision_preview.setCell(null, 0, 0, this._spriteWidth, this._spriteHeight)
      return
    }
    const [x, y] = cellOrigin(this._selectedCell, grid, this._spriteWidth, this._spriteHeight)
    this._collision_preview.setCell(this._texture, x, y, this._spriteWidth, this._spriteHeight)
    this._collision_preview.setCollider(
      Math.round(this._collider_x_row.get_value()),
      Math.round(this._collider_y_row.get_value()),
      Math.round(this._collider_w_row.get_value()),
      Math.round(this._collider_h_row.get_value()),
      // Tilesets have no shared collider, so never draw one in the preview.
      this._collision_row.get_active() && this._kind === 'character',
    )
  }

  /** Set the collider to cover the whole cell + sync the spin upper bounds. */
  private _resetColliderToCell(): void {
    const w = this._spriteWidth
    const h = this._spriteHeight
    this._syncColliderSpins([0, 0, w, h])
  }

  /** Clamp the existing collider to a (possibly resized) cell. */
  private _refitCollider(): void {
    const w = this._spriteWidth
    const h = this._spriteHeight
    this._syncColliderSpins([
      Math.min(this._collider_x_row.get_value(), w - 1),
      Math.min(this._collider_y_row.get_value(), h - 1),
      Math.min(this._collider_w_row.get_value(), w),
      Math.min(this._collider_h_row.get_value(), h),
    ])
  }

  /** Write `[x, y, w, h]` into the collider spins, bounded by the cell size. */
  private _syncColliderSpins(values: [number, number, number, number]): void {
    this._syncing = true
    const w = this._spriteWidth
    const h = this._spriteHeight
    const rows: Array<[Adw.SpinRow, number, number]> = [
      [this._collider_x_row, values[0], w],
      [this._collider_y_row, values[1], h],
      [this._collider_w_row, values[2], w],
      [this._collider_h_row, values[3], h],
    ]
    for (const [row, value, upper] of rows) {
      const bound = colliderBound(value, upper)
      const adjustment = row.get_adjustment()
      adjustment.set_upper(bound.upper)
      row.set_value(Math.max(adjustment.get_lower(), bound.value))
    }
    this._syncing = false
  }

  private _refreshValidity(): void {
    const hasImage = this._texture !== null
    const hasName = this._name_row.get_text().trim().length > 0
    this._import_button.set_sensitive(hasImage && hasName && isUsableGrid(this._grid()))
  }

  /** Assemble the descriptor for the preview grid or the final emit. */
  private _buildSpriteSetData(grid: SpriteGrid, withCollision: boolean): SpriteSetData {
    const id = slugifySpriteSetName(this._name_row.get_text())
    const collider = withCollision && this._collision_row.get_active() ? this._buildCollider() : null
    const sprites: SpriteDataSet[] = []
    for (const cell of iterateSpriteGrid({
      columns: grid.columns,
      rows: grid.rows,
      spriteWidth: this._spriteWidth,
      spriteHeight: this._spriteHeight,
    } as SpriteSetData)) {
      const sprite: SpriteDataSet = { id: cell.index, col: cell.col, row: cell.row }
      if (collider) sprite.colliders = [collider]
      sprites.push(sprite)
    }
    return {
      version: '1.0.0',
      id,
      name: this._name_row.get_text().trim() || id,
      kind: this._kind,
      image: { id: 'main', path: `${id}.png`, type: 'image' },
      spriteWidth: this._spriteWidth,
      spriteHeight: this._spriteHeight,
      columns: grid.columns,
      rows: grid.rows,
      margin: 0,
      spacing: 0,
      sprites,
    }
  }

  private _buildCollider() {
    return {
      type: 'rectangle' as const,
      width: Math.round(this._collider_w_row.get_value()),
      height: Math.round(this._collider_h_row.get_value()),
      offset: {
        x: Math.round(this._collider_x_row.get_value()),
        y: Math.round(this._collider_y_row.get_value()),
      },
    }
  }

  private _buildResult(): SpriteSetImportResult | null {
    const grid = this._grid()
    if (!this._texture || !this._sourcePath || !isUsableGrid(grid)) return null
    // Tilesets carry no shared collider — collision is per-tile.
    return {
      data: this._buildSpriteSetData(grid, this._kind === 'character'),
      sourcePath: this._sourcePath,
    }
  }
}

GObject.type_ensure(SpriteSetImportDialog.$gtype)
