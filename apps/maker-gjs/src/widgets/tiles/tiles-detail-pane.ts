import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { CharacterDefinition, SpriteDataSet, TileCollisionRef } from '@pixelrpg/engine'
import {
  CharacterPreview,
  type GdkSpriteSetResource,
  type GdkSpriteSheet,
  reparentWidget,
  SignalScope,
  TileInspector,
  TilePalette,
  type TileSize,
} from '@pixelrpg/gjs'

import Template from './tiles-detail-pane.blp'
import { wireTileEditing } from './tiles-view.wiring.ts'

// Force registration so the blueprint `$PixelRpg…` refs resolve at parse time.
GObject.type_ensure(TilePalette.$gtype)
GObject.type_ensure(TileInspector.$gtype)
GObject.type_ensure(CharacterPreview.$gtype)

/** What each tile of the shown sheet blocks, keyed by sprite id. */
export type TileCollisionMap = ReadonlyMap<number, TileCollisionRef>

/** An appearance glance: the sheet animated through a synthetic character. */
export interface AppearanceGlance {
  character: CharacterDefinition
  spriteSet: GdkSpriteSetResource | null
  subtitle: string
}

/**
 * Everything the detail can ask for on behalf of the sheet it shows.
 * The pane never knows WHICH sheet that is — it renders what it was
 * handed and reports the gesture; the gallery half owns the sprite sets,
 * the active selection and the persistence callbacks.
 */
export interface TilesDetailActions {
  selectTile(tileId: number): void
  clearTileSelection(): void
  setCollision(preset: string): void
  /** One Wall-brush stroke: the same preset on every tile it crossed. */
  setCollisions(tileIds: number[], preset: string): void
  setSurface(surface: string | null): void
  editAppearance(): void
}

/**
 * What the grid does with a drag. `select` is the picker the inspector
 * reads; the other two paint their preset onto every tile the stroke
 * crosses, and are named after the collision presets they write.
 */
const BRUSH_PRESETS: Record<string, string> = { wall: 'wall', free: 'free' }

/**
 * The Graphics detail pane — the content half of the Library's
 * gallery → detail pattern (REDESIGN.md § 4.4). Three pages, because the
 * Graphics gallery holds two KINDS of sprite sheet: a tileset renders its
 * palette plus the tile inspector, an appearance gets a read-only glance
 * that hands over to the animation matrix under Characters.
 *
 * Split out of {@link TilesView} for the same reason as the Characters
 * and Things panes: the Library's single `Adw.NavigationSplitView`
 * unmaps the sidebar while a collapsed split shows the content, so one
 * `SignalScope` covering both halves would tear down the detail's
 * handlers exactly when the phone drilled into it. Each half connects in
 * its own `vfunc_map`.
 *
 * The two are joined once, at construction time, by
 * `TilesView.attachDetail()`; from then on the gallery pushes content in
 * and the pane reports gestures back out through
 * {@link TilesDetailActions}.
 */
export class TilesDetailPane extends Adw.Bin {
  declare _detail_stack: Gtk.Stack
  declare _tile_split: Adw.OverlaySplitView
  declare _side_slot: Gtk.Box
  declare _inspector: TileInspector
  declare _palette: TilePalette
  declare _walls_toggle: Gtk.ToggleButton
  declare _brush_group: Adw.ToggleGroup
  declare _tile_sheet: Gtk.Revealer
  declare _sheet_close: Gtk.Button
  declare _sheet_slot: Gtk.Box
  declare _preview: CharacterPreview
  declare _name_label: Gtk.Label
  declare _subtitle_label: Gtk.Label
  declare _edit_button: Gtk.Button

  private _actions: TilesDetailActions | null = null
  private _inspectorCollapsed = false
  private signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTilesDetailPane',
        Template,
        InternalChildren: [
          'detail_stack',
          'tile_split',
          'side_slot',
          'inspector',
          'palette',
          'walls_toggle',
          'brush_group',
          'tile_sheet',
          'sheet_close',
          'sheet_slot',
          'preview',
          'name_label',
          'subtitle_label',
          'edit_button',
        ],
        Properties: {
          'inspector-collapsed': GObject.ParamSpec.boolean(
            'inspector-collapsed',
            'Inspector collapsed',
            'Whether the tile inspector is a bottom sheet (narrow) instead of a pinned sidebar (wide)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      TilesDetailPane,
    )
  }

  constructor() {
    super()
    // Place the inspector in the slot matching the initial (desktop)
    // layout. Later breakpoint changes re-place it via the setter.
    this._placeInspector()
  }

  /**
   * Signals wire in `vfunc_map` (not the constructor) so they re-connect
   * on every (re)map — `vfunc_unmap` does `SignalScope.disconnectAll`.
   * Without this, navigating away from Graphics and back left the
   * `tile-selected` connection disconnected, so clicking a tile no
   * longer refreshed the inspector preview.
   */
  vfunc_map(): void {
    super.vfunc_map()
    wireTileEditing(
      this.signals,
      { palette: this._palette, inspector: this._inspector, sheetClose: this._sheet_close },
      {
        selectTile: (tileId) => this._actions?.selectTile(tileId),
        clearTileSelection: () => this._actions?.clearTileSelection(),
        setCollision: (preset) => this._actions?.setCollision(preset),
        setSurface: (surface) => this._actions?.setSurface(surface),
      },
    )
    this.signals.connect(this._edit_button, 'clicked', () => {
      this._actions?.editAppearance()
    })
    this.signals.connect(this._brush_group, 'notify::active-name', () => this._applyBrushMode())
    this.signals.connect(this._palette, 'tiles-painted', (_p: TilePalette, tileIds: number[]) => {
      const preset = this._brushPreset()
      if (preset) this._actions?.setCollisions(tileIds, preset)
    })
    // The group's state survives an unmap; re-apply it so the palette
    // agrees with the visibly active toggle.
    this._applyBrushMode()
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  /** Join the pane to its gallery half. Called once, before any content. */
  bindActions(actions: TilesDetailActions): void {
    this._actions = actions
  }

  get inspectorCollapsed(): boolean {
    return this._inspectorCollapsed ?? false
  }

  set inspectorCollapsed(value: boolean) {
    if (this._inspectorCollapsed === value) return
    this._inspectorCollapsed = value
    this.notify('inspector-collapsed')
    // Re-home the tile inspector: right sidebar (desktop) ↔ bottom sheet
    // (phone).
    this._placeInspector()
  }

  /** Nothing selected yet — first paint, or a project without graphics. */
  showEmpty(): void {
    this._detail_stack.set_visible_child_name('empty')
    this.revealTileSheet(false)
  }

  /**
   * Show the tileset page. The palette is filled separately by
   * {@link setPaletteFromSpriteSheet} — a sheet can finish loading long
   * after the card was picked.
   */
  showTileset(): void {
    this._detail_stack.set_visible_child_name('tileset')
  }

  /** Show the read-only appearance glance. */
  showAppearance(glance: AppearanceGlance): void {
    this._detail_stack.set_visible_child_name('appearance')
    this.revealTileSheet(false)
    this._preview.setCharacter(glance.character, glance.spriteSet)
    this._name_label.set_label(glance.character.name)
    this._subtitle_label.set_label(glance.subtitle)
  }

  /**
   * Fill the palette from a loaded sheet. The sprite-sheet aware loader
   * auto-adopts the sheet's native column count, so a set renders in its
   * canonical grid instead of an arbitrary wrap.
   *
   * `collision` travels WITH the sheet so the "Show walls" hatch can
   * never describe the previously shown tileset.
   */
  setPaletteFromSpriteSheet(sheet: GdkSpriteSheet, collision: TileCollisionMap | null = null): void {
    this._palette.setFromSpriteSheet(sheet, undefined, collision)
  }

  /**
   * Re-describe what the tiles already on screen block — the path a
   * collision edit takes while this palette is the visible one.
   */
  setPaletteCollision(collision: TileCollisionMap | null): void {
    this._palette.setCollision(collision)
  }

  /** Empty the palette — no selection, or a sheet that failed to load. */
  clearPalette(): void {
    this._palette.setTiles([])
  }

  /**
   * Show one tile's properties, or nothing when no tile is picked. The
   * sheet's tile size decides which collision pictogram matches the
   * stored shape, so it travels with the sprite.
   */
  setSprite(def: SpriteDataSet | null, paintable: Gdk.Paintable | null, tileSize?: TileSize): void {
    this._inspector.setSprite(def, paintable, tileSize)
  }

  /**
   * Slide the phone tile sheet up or down. No-op on desktop, where the
   * inspector lives in the always-visible pinned sidebar.
   */
  revealTileSheet(reveal: boolean): void {
    this._tile_sheet.set_reveal_child(reveal && this.inspectorCollapsed)
  }

  /** The preset the Wall brush writes, or `null` while it is a picker. */
  private _brushPreset(): string | null {
    const name = this._brush_group.get_active_name()
    return name ? (BRUSH_PRESETS[name] ?? null) : null
  }

  /**
   * Join the brush toggle to the grid. Arming a brush also turns on
   * "Show walls": a stroke whose result is invisible is a stroke the
   * user cannot check, and the hint it answers ("No walls anywhere") is
   * about seeing them.
   */
  private _applyBrushMode(): void {
    const painting = this._brushPreset() !== null
    this._palette.paintMode = painting
    if (painting && !this._walls_toggle.get_active()) this._walls_toggle.activate()
  }

  /**
   * Move the single tile inspector into the slot that matches the
   * current responsive layout: the pinned right sidebar on desktop, or
   * the bottom-sheet revealer on phone. Toggles the sidebar's visibility
   * to match.
   */
  private _placeInspector(): void {
    const collapsed = this.inspectorCollapsed
    reparentWidget(this._inspector, collapsed ? this._sheet_slot : this._side_slot)
    // Desktop: show the split's pinned sidebar. Phone: hide it (the
    // inspector lives in the bottom sheet instead).
    this._tile_split.set_show_sidebar(!collapsed)
    // The phone bottom sheet only reveals on tile-select; on desktop the
    // sidebar is always shown, so keep the sheet closed.
    if (!collapsed) this._tile_sheet.set_reveal_child(false)
  }
}

GObject.type_ensure(TilesDetailPane.$gtype)
