import type Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { CharacterDefinition, GameProjectResource, SpriteDataSet } from '@pixelrpg/engine'
import {
  CardGallery,
  type GdkSpriteSetResource,
  type ModeRail,
  reparentWidget,
  SignalScope,
  type SpriteSetChoice,
  TileInspector,
  TilePalette,
} from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import { countMapUsers } from '../services/sprite-set-usage.ts'
import {
  type ActiveTileset,
  editableTilesetId,
  filterSortTilesets,
  isBuiltInSpriteSet,
  moveBefore,
  resolvePaletteTarget,
  sheetAsCharacter,
  type TilesetSort,
} from '../services/tiles-view-model.ts'
import { ResponsiveEditorView } from './responsive-editor-view.ts'
import {
  confirmAppearanceDelete,
  confirmTilesetDelete,
  presentSpriteSetImport,
  promptTilesetRename,
} from './tiles/tiles-dialogs.ts'
import { TilesQuickView } from './tiles/quick-view.ts'
import {
  wireAppearanceGallery,
  wireGalleryQuery,
  wireTileEditing,
  wireTilesetGallery,
} from './tiles/tiles-view.wiring.ts'
import {
  animationCountLabel,
  buildAppearanceCard,
  buildAppearancePreview,
  buildTilesetCard,
  buildTilesetPreview,
  tileCountLabel,
} from './tiles/tileset-cards.ts'
import {
  ensureSpriteSetLoaded,
  loadTilesetEntries,
  type TilesetEntry,
  tilesetCardFacts,
  tilesetName,
  tilesetSortKey,
} from './tiles/tileset-entries.ts'
import Template from './tiles-view.blp'

// Force registration so blueprint `$PixelRpg…` refs resolve at parse time.
GObject.type_ensure(TilePalette.$gtype)
GObject.type_ensure(TileInspector.$gtype)
GObject.type_ensure(CardGallery.$gtype)
GObject.type_ensure(TilesQuickView.$gtype)

/**
 * Tileset editor view. Lives at the same level as cast-view + atlas-view:
 * an Adw.OverlaySplitView with the ModeRail on the left, a tile inspector
 * on the right, and the central area showing a sprite-set card gallery +
 * the full tile palette of the active sprite-set.
 *
 * The gallery mirrors the Cast view's character cards (shared
 * `CardGallery`): each tileset is a card with a sheet thumbnail; the
 * "+ New tileset" header button imports one (same `SpriteSetImportDialog`
 * the cast uses), and each project tileset's card carries a delete
 * affordance. Selecting a card populates the palette below + the right
 * inspector for that set's tiles.
 *
 * Inspector edits mutate the `SpriteSetData` in memory, push the change
 * to the engine's live tilemap via `refreshTileSolidsForSprite`, and
 * persist the JSON via host-supplied callbacks (the host owns file IO).
 * Tileset create/delete also route to the host (shared with the Cast
 * controller's sprite-set CRUD + collab broadcast).
 */
export class TilesView extends ResponsiveEditorView {
  declare _inspector: TileInspector
  declare _palette: TilePalette
  declare _tilesets_gallery: CardGallery
  declare _search_entry: Gtk.SearchEntry
  declare _sort_dropdown: Gtk.DropDown
  declare _nav: Adw.NavigationView
  declare _detail_page: Adw.NavigationPage
  // Responsive tile inspector. On desktop the inspector lives in the
  // pinned right sidebar of `_tile_split` (`_side_slot`); on phone it's
  // reparented into the `_tile_sheet` bottom-sheet revealer (`_sheet_slot`).
  declare _tile_split: Adw.OverlaySplitView
  declare _tile_sheet: Gtk.Revealer
  declare _sheet_close: Gtk.Button
  declare _sheet_slot: Gtk.Box
  declare _side_slot: Gtk.Box
  // Desktop gallery quick-view: one read-only glance shared by both
  // sections, swapping its preview by kind (see `TilesQuickView`).
  declare _quick_view: TilesQuickView
  // ── Appearances (character sprite sheets) gallery ──
  // Asset management only: import / delete / glance. Editing an
  // appearance's animations happens in the Cast matrix — a card's "edit"
  // affordance jumps there (`win.edit-appearance`).
  declare _appearances_gallery: CardGallery

  private _projectName = ''
  // Quick-view shown on desktop; flipped off when the breakpoint collapses
  // (see `_onInspectorCollapsedChanged`).
  private _showQuickview = true

  private signals = new SignalScope()
  private _spriteSets: TilesetEntry[] = []
  /** tileset id → how many maps reference it (for the card's "used by K" line). */
  private _mapUsage = new Map<string, number>()
  private _search = ''
  private _sort: TilesetSort = 'default'
  /**
   * The selected tileset AND the state of the grid on screen for it —
   * one field, written only by {@link _syncPalette}. Two separate fields
   * (an id plus whatever the palette happened to be showing) is how a
   * failed sheet load left the previous set's tiles under the new set's
   * id, after which a tile click wrote that sprite id into the new set.
   */
  private _active: ActiveTileset | null = null
  private _selectedSpriteId: number | null = null
  // Which kind the quick-view + single gallery highlight currently reflect.
  // Both sections share one quick-view sidebar (desktop) and a select→glance
  // interaction; this tracks which one is showing so a re-hydrate keeps the
  // right card lit and the Edit button routes correctly (tileset → its
  // detail page; appearance → the Cast matrix).
  private _activeKind: 'tileset' | 'appearance' = 'tileset'

  // Appearance state. Sourced from the cast controller (the owner of
  // sprite-sheet data) via `setAppearances`, NOT from `setProject` — so
  // an animation edit re-renders cheaply off the controller's memoised
  // preview cache instead of re-wrapping every tileset.
  private _appearances: SpriteSetChoice[] = []
  private _appearanceSetsById = new Map<string, GdkSpriteSetResource | null>()
  private _activeAppearanceId: string | null = null

  private _onSolidChanged: ((spriteSetId: string, spriteId: number, solid: boolean) => void) | null = null
  private _onSurfaceChanged: ((spriteSetId: string, spriteId: number, surface: string | null) => void) | null = null
  private _onTilesetUsage: ((spriteSetId: string) => number) | null = null
  // Deleting an appearance routes to the host (it owns sprite-set data +
  // collab broadcast); keyed by sheet id. Animation edits live in Cast.
  private _onDeleteAppearanceRequested: ((sheetId: string) => void) | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'TilesView',
        Template,
        InternalChildren: [
          'mode_rail',
          'inspector',
          'palette',
          'tilesets_gallery',
          'search_entry',
          'sort_dropdown',
          'nav',
          'detail_page',
          'tile_split',
          'tile_sheet',
          'sheet_close',
          'sheet_slot',
          'side_slot',
          'quick_view',
          'appearances_gallery',
        ],
        Properties: {
          'project-name': GObject.ParamSpec.string(
            'project-name',
            'Project Name',
            'Display name fed into the ModeRail hero block',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          // show-library/-inspector + *-collapsed are inherited from
          // ResponsiveEditorView; only the gallery quick-view is local.
          'show-quickview': GObject.ParamSpec.boolean(
            'show-quickview',
            'Show Quick-view',
            "Whether the gallery's right quick-view sidebar is shown (desktop)",
            GObject.ParamFlags.READWRITE,
            true,
          ),
        },
        Signals: {
          // mode-changed is inherited from ResponsiveEditorView.

          // A tileset was imported via this view's dialog — payload is
          // the `SpriteSetImportResult`. The host routes it to the
          // shared sprite-set import path (copy + register + broadcast).
          'spriteset-imported': { param_types: [GObject.TYPE_JSOBJECT] },
          // The user renamed a tileset — payload is its id + the new name.
          // The host re-persists the descriptor + broadcasts the update.
          'spriteset-rename-requested': { param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING] },
          // The user drag-reordered the tileset cards — payload is the
          // full ordered id list. The host rewrites `data.spriteSets[]`
          // order + persists (display order; local, not collab-synced).
          'spriteset-reorder-requested': { param_types: [GObject.TYPE_JSOBJECT] },
          // The user confirmed deleting a tileset — payload is its id.
          // The host removes the files + reference + broadcasts.
          'spriteset-delete-requested': { param_types: [GObject.TYPE_STRING] },
        },
      },
      TilesView,
    )
  }

  constructor() {
    super()
    // Place the inspector in the slot matching the initial (desktop)
    // layout. Later breakpoint changes re-place it via the setter.
    this._placeInspector()
    // Tilesets are drag-reorderable (cosmetic display order); the Cast
    // galleries leave this off.
    this._tilesets_gallery.reorderable = true
  }

  /**
   * Signals wire in `vfunc_map` (not the constructor) so they
   * re-connect on every (re)map — `vfunc_unmap` does
   * `SignalScope.disconnectAll`. Without this, navigating away from
   * the Tiles view and back left the `tile-selected` connection
   * disconnected, so clicking a tile no longer refreshed the
   * inspector preview (the user-reported bug from image #53).
   */
  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._mode_rail, 'mode-changed', (_v: ModeRail, mode: string) => {
      this.emit('mode-changed', mode)
    })
    wireGalleryQuery(
      this.signals,
      { searchEntry: this._search_entry, sortDropdown: this._sort_dropdown },
      {
        setSearch: (search) => {
          this._search = search
          this._rebuildGallery()
        },
        setSort: (sort) => {
          this._sort = sort
          this._rebuildGallery()
        },
      },
    )
    wireTilesetGallery(this.signals, this._tilesets_gallery, {
      select: (id) => this._selectTileset(id),
      openDetail: () => this._openTilesetDetail(),
      requestRename: (id) => this._presentRenameTileset(id),
      requestReorder: (draggedId, targetId) => this._reorderTilesets(draggedId, targetId),
      requestDelete: (id) => this._confirmDeleteTileset(id),
    })
    wireAppearanceGallery(this.signals, this._appearances_gallery, {
      select: (id) => this._selectAppearance(id),
      editInCast: (id) => this._editAppearanceInCast(id),
      requestDelete: (id) => this._confirmDeleteAppearance(id),
    })
    wireTileEditing(
      this.signals,
      { palette: this._palette, inspector: this._inspector, sheetClose: this._sheet_close },
      {
        selectTile: (tileId) => this._selectTile(tileId),
        clearTileSelection: () => this._clearTileSelection(),
        setSolid: (solid) => this._applySolid(solid),
        setSurface: (surface) => this._applySurface(surface),
      },
    )
    this.signals.connect(this._quick_view, 'edit-requested', () => this._editActiveSelection())
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  get projectName(): string {
    return this._projectName ?? ''
  }

  set projectName(value: string) {
    if (this._projectName === value) return
    this._projectName = value
    this._mode_rail.projectName = value
    this.notify('project-name')
  }

  get showQuickview(): boolean {
    return this._showQuickview ?? true
  }

  set showQuickview(value: boolean) {
    if (this._showQuickview === value) return
    this._showQuickview = value
    this.notify('show-quickview')
  }

  protected override _onInspectorCollapsedChanged(collapsed: boolean): void {
    // Collapsed = narrow/phone → hide the gallery quick-view (a tap
    // drills straight into the detail page). Expanded = desktop → show.
    this.showQuickview = !collapsed
    // Re-home the tile inspector: right sidebar (desktop) ↔ bottom sheet
    // (phone).
    this._placeInspector()
  }

  /**
   * Wire host callbacks for property mutations. Decouples this view
   * from the file-IO + engine-refresh path — same pattern as
   * `CastView.bindCallbacks`.
   */
  bindCallbacks(callbacks: {
    setSolid: (spriteSetId: string, spriteId: number, solid: boolean) => void
    setSurface: (spriteSetId: string, spriteId: number, surface: string | null) => void
    tilesetUsage: (spriteSetId: string) => number
  }): void {
    this._onSolidChanged = callbacks.setSolid
    this._onSurfaceChanged = callbacks.setSurface
    this._onTilesetUsage = callbacks.tilesetUsage
  }

  /**
   * Wire the appearance (sprite-sheet) asset callbacks. Set once by the
   * host, which routes them to the project store — the single owner of
   * sprite-set data + collab broadcast. Only deletion lives here now;
   * animation authoring moved to the Cast view.
   */
  bindAppearanceCallbacks(callbacks: { deleteAppearance: (sheetId: string) => void }): void {
    this._onDeleteAppearanceRequested = callbacks.deleteAppearance
  }

  /**
   * Push the project's appearance (character-kind sprite-sheet) list +
   * the shared preview-resource map into the Sheets view. Called by the
   * host on every cast-controller refresh (project load + any sprite-set
   * or animation mutation). Preserves the active appearance across
   * re-pushes so an in-flight animation edit keeps its detail page.
   */
  setAppearances(sheets: SpriteSetChoice[], spriteSetsById: Map<string, GdkSpriteSetResource | null>): void {
    this._appearances = sheets
    this._appearanceSetsById = spriteSetsById
    if (this._activeAppearanceId && !sheets.find((s) => s.id === this._activeAppearanceId)) {
      this._activeAppearanceId = null
    }
    if (!this._activeAppearanceId && sheets.length > 0) {
      this._activeAppearanceId = sheets[0].id
    }
    this._rebuildAppearancesGallery()
    // If the user is currently glancing at an appearance, refresh it (e.g.
    // an animation edit changed the count). Tileset glances are untouched.
    if (this._activeKind === 'appearance') this._refreshQuickView()
  }

  /**
   * Replace the view's data from a freshly loaded project resource.
   * Called by the host when entering the Tiles mode and after any
   * tile-property mutation or tileset create/delete so the gallery +
   * inspector reflect the persisted state.
   */
  async setProject(project: GameProjectResource | null): Promise<void> {
    this._projectName = project?.data?.name ?? _('New Project')
    if (this._mode_rail) this._mode_rail.projectName = this._projectName

    if (!project) {
      this._clearProject()
      return
    }

    this._spriteSets = await loadTilesetEntries(project)
    this._mapUsage = countMapUsers(project)

    // Keep the active selection if still present; otherwise fall back
    // to the first set.
    const keep = this._active && this._spriteSets.some((entry) => entry.id === this._active?.id)
    await this._syncPalette(keep ? (this._active?.id ?? null) : (this._spriteSets[0]?.id ?? null))
    this._rebuildGallery()
    // Only steal the quick-view glance if the user is currently on a
    // tileset; a tileset re-hydrate (e.g. reorder) shouldn't yank a
    // showing appearance glance away.
    if (this._activeKind === 'tileset') this._refreshQuickView()
  }

  /**
   * Reset navigation to the gallery overview — called by the host on a
   * project swap. Not done on every re-map (that fired on resize and
   * yanked the user out of the editor).
   */
  resetToOverview(): void {
    if (this._nav.get_visible_page()?.tag !== 'gallery') this._nav.replace_with_tags(['gallery'])
  }

  /** Select a tileset by id + open its detail page (host / MCP entry). */
  focusTileset(id: string): void {
    this._selectTileset(id)
    this._openTilesetDetail()
  }

  /**
   * Select an appearance (sprite-sheet) by id + show its glance. Used by
   * the `win.open-appearance` action + the character detail's "Edit
   * appearance" deep-link (asset management). Animations are authored in
   * Cast — a narrow layout (no glance) jumps there via {@link _selectAppearance}.
   */
  focusAppearance(id: string): void {
    this._selectAppearance(id)
  }

  /**
   * Present the sprite-set import dialog as the "New tileset" flow. On
   * import it emits `spriteset-imported` with the result; the host runs
   * the shared copy + register + broadcast path and re-hydrates this
   * view. Reuses the exact dialog the Cast view uses for sprite-sets.
   */
  presentTilesetImportDialog(): void {
    presentSpriteSetImport(this, 'tileset', (result) => {
      this.emit('spriteset-imported', result)
    })
  }

  /**
   * Present the sprite-set import dialog as the "Import appearance" flow
   * (the Appearances "+" button, wired to `win.new-spriteset`). Same
   * dialog as the tileset import but tagged `character` so the copy +
   * register path files it as an appearance; routes through the shared
   * `spriteset-imported` signal → the cast controller's import path.
   */
  presentAppearanceImportDialog(): void {
    presentSpriteSetImport(this, 'character', (result) => {
      this.emit('spriteset-imported', result)
    })
  }

  /**
   * Push the selected tile's properties into the inspector. Called
   * after every selection change + after host-driven mutations so
   * the inspector mirrors the latest persisted state.
   */
  refreshInspectorForSelection(): void {
    this._refreshInspector()
  }

  /**
   * Move the single tile inspector into the slot that matches the
   * current responsive layout: the pinned right `side_panel` on desktop,
   * or the `tile_sheet` bottom-sheet revealer on phone. Toggles the
   * sidebar's visibility to match.
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

  private _clearProject(): void {
    this._spriteSets = []
    this._active = null
    this._selectedSpriteId = null
    this._activeKind = 'tileset'
    this._tilesets_gallery.setItems([])
    this._palette.setTiles([])
    this._inspector.setSprite(null, null)
    this._refreshQuickView()
  }

  private _mapUsers(id: string): number {
    return this._mapUsage.get(id) ?? 0
  }

  private _rebuildGallery(): void {
    const entries = filterSortTilesets(this._spriteSets, (entry) => tilesetSortKey(entry, this._mapUsers(entry.id)), {
      search: this._search,
      sort: this._sort,
    })
    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    this._tilesets_gallery.setItems(
      entries.map((entry) => buildTilesetCard(tilesetCardFacts(entry, this._mapUsers(entry.id)))),
      (item) => {
        const entry = byId.get(item.id)
        return entry ? buildTilesetPreview(entry.gdk, entry.resource.data?.columns ?? 6) : null
      },
    )
    // Only one card across both galleries is lit — the active selection's.
    this._tilesets_gallery.setActiveId(this._activeKind === 'tileset' ? (this._active?.id ?? null) : null)
  }

  /**
   * Select a tileset: make it the active selection, refresh the quick-view
   * + (lazily) the palette, and highlight the card (clearing any appearance
   * highlight). On a NARROW layout (no quick-view sidebar) this also drills
   * into the detail page; on desktop it just updates the quick-view (the
   * user opens the detail explicitly via double-click or the "Edit" button).
   * Mirrors {@link _selectAppearance} so both sections behave identically.
   */
  private _selectTileset(id: string): void {
    const entry = this._spriteSets.find((s) => s.id === id)
    if (!entry) return
    this._activeKind = 'tileset'
    // Start with the tile-properties sheet closed — no tile picked yet.
    this._tile_sheet.set_reveal_child(false)
    this._tilesets_gallery.setActiveId(id)
    this._appearances_gallery.setActiveId(null)
    this._detail_page.title = tilesetName(entry)
    // `_syncPalette` moves `_active` synchronously before its first
    // await, so the glance below already describes the new selection.
    void this._syncPalette(id)
    this._refreshQuickView()
    if (this.inspectorCollapsed) this._openTilesetDetail()
  }

  /**
   * Drill into the tileset detail sub-page (tile palette + inspector) for
   * the active tileset. No-op if already there. The inspector stays closed
   * until the user picks a tile (it has nothing to show for a whole set),
   * matching the palette's tile-selected auto-open.
   */
  private _openTilesetDetail(): void {
    if (!this._active) return
    if (this._nav.get_visible_page()?.tag !== 'detail') this._nav.push_by_tag('detail')
  }

  /** The quick-view "Edit" button: a tileset opens its detail, an appearance jumps to Cast. */
  private _editActiveSelection(): void {
    if (this._activeKind !== 'appearance') {
      this._openTilesetDetail()
      return
    }
    if (this._activeAppearanceId) this._editAppearanceInCast(this._activeAppearanceId)
  }

  /**
   * Populate the shared desktop quick-view sidebar for the active
   * selection — a static sheet thumbnail for a tileset, an animated
   * preview for an appearance (`_activeKind`).
   */
  private _refreshQuickView(): void {
    if (this._activeKind === 'appearance') this._showAppearanceGlance()
    else this._showTilesetGlance()
  }

  private _showAppearanceGlance(): void {
    const character = this._sheetAsCharacter(this._activeAppearanceId)
    if (!character) {
      this._quick_view.showEmpty()
      return
    }
    const sheet = this._activeAppearanceId ? (this._appearanceSetsById.get(this._activeAppearanceId) ?? null) : null
    this._quick_view.showAppearance({
      character,
      spriteSet: sheet,
      subtitle: animationCountLabel(sheet?.data?.characterAnimations?.length ?? 0),
    })
  }

  private _showTilesetGlance(): void {
    const active = this._activeSpriteSet()
    if (!active) {
      this._quick_view.clearTileset()
      return
    }
    this._quick_view.showTileset({
      thumbnail: active.gdk?.createSheetThumbnail(240) ?? null,
      title: tilesetName(active),
      subtitle: tileCountLabel(active.resource.data?.sprites?.length ?? 0),
    })
  }

  private _activeSpriteSet(): TilesetEntry | null {
    const id = this._active?.id
    return id ? (this._spriteSets.find((s) => s.id === id) ?? null) : null
  }

  /**
   * The ONE writer of {@link _active} and of the palette's contents.
   *
   * Moves the selection to `id` (synchronously, before the first await,
   * so the gallery + glance already describe it), loads that set's
   * sheet, and applies exactly one of the three outcomes
   * `resolvePaletteTarget` can produce. There is deliberately no
   * "leave the palette as it was" branch: a failed load CLEARS the grid
   * and marks the selection `unavailable`, because the previous set's
   * tiles under the new set's id is how a tile click ended up writing a
   * stale sprite id into a different set's id space.
   *
   * A slower load losing the race to a newer selection drops its result
   * — the newest selection owns the palette.
   */
  private async _syncPalette(id: string | null): Promise<void> {
    if (this._active?.id !== id) this._selectedSpriteId = null
    // Grid not valid for this id until the load lands.
    this._active = id ? { id, palette: 'unavailable' } : null
    const { active, sheet } = await resolvePaletteTarget(id, async (setId) => {
      const entry = this._spriteSets.find((s) => s.id === setId)
      if (!entry || !(await ensureSpriteSetLoaded(entry))) return null
      return entry.gdk?.spriteSheet ?? null
    })
    if (this._active?.id !== id) return
    this._active = active
    // The sprite-sheet aware loader auto-adopts the sheet's native column
    // count, so a set renders in its canonical grid (32×N for
    // lokiri-forest) instead of an arbitrary wrap.
    if (sheet) this._palette.setFromSpriteSheet(sheet)
    else this._palette.setTiles([])
    this._refreshInspector()
  }

  private _selectTile(tileId: number): void {
    // Picking a tile refreshes the inspector. On phone that means sliding
    // the bottom sheet up; on desktop the sidebar is already visible, so it
    // just updates in place. A palette that isn't this set's own grid has
    // no tile to select (see `_syncPalette`).
    if (!editableTilesetId(this._active)) return
    this._selectedSpriteId = tileId
    this._refreshInspector()
    if (this.inspectorCollapsed) this._tile_sheet.set_reveal_child(true)
  }

  /** The phone sheet's close button: slide it back down + drop the selection. */
  private _clearTileSelection(): void {
    this._tile_sheet.set_reveal_child(false)
    this._selectedSpriteId = null
    this._refreshInspector()
  }

  private _refreshInspector(): void {
    const active = this._activeSpriteSet()
    if (!active || this._selectedSpriteId == null) {
      this._inspector.setSprite(null, null)
      return
    }
    const def: SpriteDataSet | undefined = active.resource.data?.sprites.find((s) => s.id === this._selectedSpriteId)
    const sprite = active.gdk?.getSprite(this._selectedSpriteId)
    this._inspector.setSprite(def ?? null, sprite?.createPaintable() ?? null)
  }

  /**
   * The sprite-set id a tile-property edit is attributed to. Only a set
   * whose OWN grid is on screen qualifies — see {@link _syncPalette}.
   */
  private _editableTilesetId(): string | null {
    return editableTilesetId(this._active)
  }

  private _applySolid(solid: boolean): void {
    const id = this._editableTilesetId()
    if (!id || this._selectedSpriteId == null) return
    this._onSolidChanged?.(id, this._selectedSpriteId, solid)
  }

  private _applySurface(surface: string | null): void {
    const id = this._editableTilesetId()
    if (!id || this._selectedSpriteId == null) return
    this._onSurfaceChanged?.(id, this._selectedSpriteId, surface)
  }

  /**
   * Prompt for a new display name for a tileset, then emit
   * `spriteset-rename-requested` (id + name) so the host re-persists the
   * descriptor + broadcasts the update over collab. Built-ins (no project
   * files) aren't renamable — their cards don't offer the menu item.
   */
  private _presentRenameTileset(id: string): void {
    const entry = this._spriteSets.find((s) => s.id === id)
    if (!entry || isBuiltInSpriteSet(id)) return
    void promptTilesetRename(this, tilesetName(entry)).then((name) => {
      if (name) this.emit('spriteset-rename-requested', id, name)
    })
  }

  /**
   * Confirm + request deletion of a tileset. Destructive (removes the
   * project's `<id>.png` + `<id>.json` and, in collab, broadcasts the
   * removal) so it routes through an `Adw.AlertDialog` first; the host
   * does the actual removal on confirm.
   */
  private _confirmDeleteTileset(id: string): void {
    const entry = this._spriteSets.find((s) => s.id === id)
    if (!entry || isBuiltInSpriteSet(id)) return
    void confirmTilesetDelete(this, tilesetName(entry), this._onTilesetUsage?.(id) ?? 0).then((confirmed) => {
      if (confirmed) this.emit('spriteset-delete-requested', id)
    })
  }

  /**
   * Move `draggedId` to just before `targetId` in the gallery, rebuild
   * for instant feedback, and emit the full ordered id list so the host
   * rewrites `data.spriteSets[]` order + persists.
   */
  private _reorderTilesets(draggedId: string, targetId: string): void {
    const next = moveBefore(this._spriteSets, (entry) => entry.id, draggedId, targetId)
    if (!next) return
    this._spriteSets = next
    this._rebuildGallery()
    this.emit(
      'spriteset-reorder-requested',
      next.map((s) => s.id),
    )
  }

  // ── Appearances (sprite-sheet animation editor) ───────────────────

  /**
   * Rebuild the appearance cards. Each previews the sheet's animations
   * via a showcase {@link CharacterPreview} bound to a synthetic character
   * (see {@link _sheetAsCharacter}).
   */
  private _rebuildAppearancesGallery(): void {
    this._appearances_gallery.setItems(
      this._appearances.map((sheet) => buildAppearanceCard(sheet, this._sheetAnimations(sheet.id).length)),
      (item) => buildAppearancePreview(this._sheetAsCharacter(item.id), this._appearanceSetsById.get(item.id) ?? null),
    )
    // Lit only when an appearance is the active selection (see `_rebuildGallery`).
    this._appearances_gallery.setActiveId(this._activeKind === 'appearance' ? this._activeAppearanceId : null)
  }

  /**
   * Select an appearance: make it the active selection, refresh the
   * quick-view glance, and highlight the card (clearing any tileset
   * highlight). On a NARROW layout (no glance) a tap jumps straight to the
   * Cast matrix — an appearance's animations are authored there now.
   * Mirrors {@link _selectTileset} so both sections behave identically.
   */
  private _selectAppearance(id: string): void {
    const sheet = this._appearances.find((s) => s.id === id)
    if (!sheet) return
    this._activeAppearanceId = id
    this._activeKind = 'appearance'
    this._appearances_gallery.setActiveId(id)
    this._tilesets_gallery.setActiveId(null)
    this._refreshQuickView()
    if (this.inspectorCollapsed) this._editAppearanceInCast(id)
  }

  /**
   * Jump to the Cast view to edit an appearance's animations — the
   * authoring home. The window action selects the first character wearing
   * the sheet (or toasts when it's an orphan appearance).
   */
  private _editAppearanceInCast(id: string): void {
    this.activate_action('win.edit-appearance', GLib.Variant.new_string(id))
  }

  /** The animations owned by the appearance sheet with `spriteSetId`. */
  private _sheetAnimations(spriteSetId: string) {
    return this._appearanceSetsById.get(spriteSetId)?.data?.characterAnimations ?? []
  }

  private _sheetAsCharacter(sheetId: string | null): CharacterDefinition | null {
    return sheetAsCharacter(sheetId, this._appearances, (id) => this._sheetAnimations(id))
  }

  /**
   * Confirm + delete an appearance sheet. Destructive — drops the sheet
   * (and its animations); any character still referencing it falls back
   * to a blank preview until reassigned.
   */
  private _confirmDeleteAppearance(id: string): void {
    const sheet = this._appearances.find((s) => s.id === id)
    if (!sheet) return
    void confirmAppearanceDelete(this, sheet.name).then((confirmed) => {
      if (confirmed) this._onDeleteAppearanceRequested?.(id)
    })
  }
}

GObject.type_ensure(TilesView.$gtype)
