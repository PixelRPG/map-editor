import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { CharacterDefinition, SpriteDataSet } from '@pixelrpg/engine'
import {
  CharacterPreview,
  type GdkSpriteSetResource,
  type GdkSpriteSheet,
  reparentWidget,
  SignalScope,
  TileInspector,
  TilePalette,
} from '@pixelrpg/gjs'

import Template from './tiles-detail-pane.blp'
import { wireTileEditing } from './tiles-view.wiring.ts'

// Force registration so the blueprint `$PixelRpg…` refs resolve at parse time.
GObject.type_ensure(TilePalette.$gtype)
GObject.type_ensure(TileInspector.$gtype)
GObject.type_ensure(CharacterPreview.$gtype)

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
  setSolid(solid: boolean): void
  setSurface(surface: string | null): void
  editAppearance(): void
}

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
        setSolid: (solid) => this._actions?.setSolid(solid),
        setSurface: (surface) => this._actions?.setSurface(surface),
      },
    )
    this.signals.connect(this._edit_button, 'clicked', () => {
      this._actions?.editAppearance()
    })
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
   */
  setPaletteFromSpriteSheet(sheet: GdkSpriteSheet): void {
    this._palette.setFromSpriteSheet(sheet)
  }

  /** Empty the palette — no selection, or a sheet that failed to load. */
  clearPalette(): void {
    this._palette.setTiles([])
  }

  /** Show one tile's properties, or nothing when no tile is picked. */
  setSprite(def: SpriteDataSet | null, paintable: Gdk.Paintable | null): void {
    this._inspector.setSprite(def, paintable)
  }

  /**
   * Slide the phone tile sheet up or down. No-op on desktop, where the
   * inspector lives in the always-visible pinned sidebar.
   */
  revealTileSheet(reveal: boolean): void {
    this._tile_sheet.set_reveal_child(reveal && this.inspectorCollapsed)
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
