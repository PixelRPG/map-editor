import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import {
  type CharacterDefinition,
  type ColliderShape,
  floorSpriteIdOf,
  type GameProjectResource,
  type SpriteDataSet,
  spriteSetCollisionRefs,
} from '@pixelrpg/engine'
import {
  CardGallery,
  type GdkSpriteSetResource,
  type PeerMarker,
  sheetGridOf,
  SignalScope,
  type SpriteSetChoice,
  type SpriteSetImportResult,
  TerrainDefineDialog,
  type TerrainDraft,
  TileShapeDialog,
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
import {
  confirmAppearanceDelete,
  confirmTilesetDelete,
  presentSpriteSetImport,
  promptTilesetRename,
} from './tiles/tiles-dialogs.ts'
import type { TileCollisionMap, TilesDetailActions, TilesDetailPane } from './tiles/tiles-detail-pane.ts'
import { wireAppearanceGallery, wireGalleryQuery, wireTilesetGallery } from './tiles/tiles-view.wiring.ts'
import {
  animationCountLabel,
  buildAppearanceCard,
  buildAppearancePreview,
  buildTilesetCard,
  buildTilesetPreview,
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
GObject.type_ensure(CardGallery.$gtype)

/**
 * Typed view of the signals {@link TilesView} registers, layered on the parent's
 * own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface TilesViewSignals extends Adw.Bin.SignalSignatures {
  'notify::active-item-id': (pspec: GObject.ParamSpec) => void
  'spriteset-imported': (result: SpriteSetImportResult) => void
  'spriteset-rename-requested': (spriteSetId: string, name: string) => void
  'spriteset-reorder-requested': (orderedIds: string[]) => void
  'spriteset-delete-requested': (spriteSetId: string) => void
  'detail-requested': () => void
  'detail-title': (title: string) => void
}

/**
 * The Library's **Graphics** gallery — tilesets and appearances as raw
 * assets, in two card sections over one search + sort. The detail half
 * is a {@link TilesDetailPane} in the `LibraryView` host's one
 * `Adw.NavigationSplitView`, joined by {@link attachDetail} so each
 * half connects its handlers in its own `vfunc_map` (a collapsed split
 * unmaps the sidebar while the detail shows).
 *
 * The host owns the navigation: this widget asks for the detail with
 * `detail-requested` and names it with `detail-title`.
 *
 * A tileset's detail is its full palette plus the tile inspector; an
 * appearance's is a read-only glance whose "Edit animations" jumps to
 * the Characters matrix, the authoring home. Each section's "+" imports
 * one (the same `SpriteSetImportDialog` the character dialog uses), and
 * each project sheet's card carries a delete affordance.
 *
 * The first entry is selected on arrival (REDESIGN.md § 4.4 — the detail
 * is never a "No selection" pane), but silently: an auto-selection emits
 * `detail-title` and never `detail-requested`, so a phone is not drilled
 * into a detail nobody asked for. The selection is this page's own and
 * survives a chip switch.
 *
 * Inspector edits mutate the `SpriteSetData` in memory, push the change
 * to the engine's live tilemap via `refreshTileSolidsForSprite`, and
 * persist the JSON via host-supplied callbacks (the host owns file IO).
 * Tileset create/delete also route to the host (shared with the Cast
 * controller's sprite-set CRUD + collab broadcast).
 */
export class TilesView extends Adw.Bin {
  declare _tilesets_gallery: CardGallery
  declare _search_entry: Gtk.SearchEntry
  declare _sort_dropdown: Gtk.DropDown
  // ── Appearances (character sprite sheets) gallery ──
  // Asset management only: import / delete / glance. Editing an
  // appearance's animations happens in the Characters matrix — the
  // detail's "Edit animations" jumps there (`win.edit-appearance`).
  declare _appearances_gallery: CardGallery

  /** The content half, joined by {@link attachDetail}. */
  private _detail: TilesDetailPane | null = null

  private signals = new SignalScope()
  private _fullView = false
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
  // Which kind the detail + the lit card currently reflect. Both
  // sections share one detail pane and a select→show interaction; this
  // tracks which one is showing so a re-hydrate keeps the right card lit
  // and the detail renders the right page (palette vs. glance).
  private _activeKind: 'tileset' | 'appearance' = 'tileset'
  /**
   * Whether the current selection is one the page made for itself
   * (§ 4.4: never a "No selection" pane) rather than one anybody picked.
   *
   * It matters because the two sections are filled by two different
   * callers and the cast controller runs first: `setAppearances` would
   * light the first appearance while the tileset list was still empty,
   * and `setProject` then had to leave that glance alone. An auto-made
   * selection is provisional, so `setProject` may upgrade it to the
   * first tileset — the section the Graphics gallery leads with.
   */
  private _autoSelected = false

  // Appearance state. Sourced from the cast controller (the owner of
  // sprite-sheet data) via `setAppearances`, NOT from `setProject` — so
  // an animation edit re-renders cheaply off the controller's memoised
  // preview cache instead of re-wrapping every tileset.
  private _appearances: SpriteSetChoice[] = []
  private _appearanceSetsById = new Map<string, GdkSpriteSetResource | null>()
  private _activeAppearanceId: string | null = null
  /** Last value `active-item-id` was notified with — see `_notifyActiveItem`. */
  private _announcedItemId = ''

  private _onCollisionChanged: ((spriteSetId: string, spriteId: number, preset: string) => void) | null = null
  private _onCollisionsChanged: ((spriteSetId: string, spriteIds: number[], preset: string) => void) | null = null
  private _onShapesChanged: ((spriteSetId: string, spriteId: number, shapes: ColliderShape[]) => void) | null = null
  private _onSurfaceChanged: ((spriteSetId: string, spriteId: number, surface: string | null) => void) | null = null
  private _onTerrainSaved: ((spriteSetId: string, draft: TerrainDraft) => void) | null = null
  private _onTerrainDeleted: ((spriteSetId: string, terrainId: string) => void) | null = null
  private _onTilesetUsage: ((spriteSetId: string) => number) | null = null
  // Deleting an appearance routes to the host (it owns sprite-set data +
  // collab broadcast); keyed by sheet id. Animation edits live in Cast.
  private _onDeleteAppearanceRequested: ((sheetId: string) => void) | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'TilesView',
        Template,
        InternalChildren: ['tilesets_gallery', 'search_entry', 'sort_dropdown', 'appearances_gallery'],
        Properties: {
          // Pushed down from the Library host so the import dialog this
          // view presents inherits the window's tier.
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full view',
            'Whether the dialogs this view presents show their advanced rows',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          // What the Library host announces as our awareness place.
          // A property rather than a signal so a late listener (the
          // window wires presence after construction) can still read
          // where we already are.
          'active-item-id': GObject.ParamSpec.string(
            'active-item-id',
            'Active item id',
            'Id of the tileset or appearance currently selected, for presence — empty when none',
            GObject.ParamFlags.READABLE,
            '',
          ),
        },
        Signals: {
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
          // The user picked a card: show the detail half (on a collapsed
          // split that is the phone's drill-down).
          'detail-requested': {},
          // What the detail is showing, for the host's one header.
          'detail-title': { param_types: [GObject.TYPE_STRING] },
        },
      },
      TilesView,
    )
  }

  declare connect: GObject.SignalMethods<this, TilesViewSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, TilesViewSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, TilesViewSignals>['emit']

  constructor() {
    super()
    // Tilesets are drag-reorderable (cosmetic display order); the Cast
    // galleries leave this off.
    this._tilesets_gallery.reorderable = true
  }

  /**
   * Join this gallery to its {@link TilesDetailPane}. Called once, from
   * the `LibraryView` host's constructor: the pane's own handlers live
   * in ITS `vfunc_map`, so the gestures it reports must be connected
   * outside any map scope — a collapsed split unmaps this half while
   * the detail is on screen.
   */
  attachDetail(detail: TilesDetailPane): void {
    this._detail = detail
    detail.bindActions(this._detailActions())
    this._refreshDetail()
  }

  private _detailActions(): TilesDetailActions {
    return {
      selectTile: (tileId) => this._selectTile(tileId),
      clearTileSelection: () => this._clearTileSelection(),
      setCollision: (preset) => this._applyCollision(preset),
      setCollisions: (tileIds, preset) => this._applyCollisions(tileIds, preset),
      setSurface: (surface) => this._applySurface(surface),
      editAppearance: () => {
        if (this._activeAppearanceId) this._editAppearanceInCast(this._activeAppearanceId)
      },
      editShape: () => this._presentShapeEditor(),
      editTerrains: () => this.editTerrains(''),
    }
  }

  /**
   * Open the ground-brush dialog on the shown tileset, on the page
   * `target` names (see `win.edit-terrains`). Public because that
   * action reaches it too, not only the detail pane's row.
   */
  editTerrains(target: string): void {
    this._presentTerrainDialog(target)
  }

  /**
   * Signals wire in `vfunc_map` (not the constructor) so they
   * re-connect on every (re)map — `vfunc_unmap` does
   * `SignalScope.disconnectAll`. Without this, navigating away from
   * the Graphics page and back left the card connections disconnected,
   * so clicking a card no longer refreshed the detail.
   */
  vfunc_map(): void {
    super.vfunc_map()
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
      openDetail: () => this.emit('detail-requested'),
      requestRename: (id) => this._presentRenameTileset(id),
      requestReorder: (draggedId, targetId) => this._reorderTilesets(draggedId, targetId),
      requestDelete: (id) => this._confirmDeleteTileset(id),
    })
    wireAppearanceGallery(this.signals, this._appearances_gallery, {
      select: (id) => this._selectAppearance(id),
      editInCast: (id) => this._editAppearanceInCast(id),
      requestDelete: (id) => this._confirmDeleteAppearance(id),
    })
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  /**
   * Wire host callbacks for property mutations. Decouples this view
   * from the file-IO + engine-refresh path — same pattern as
   * `CastView.bindCallbacks`.
   */
  bindCallbacks(callbacks: {
    setCollision: (spriteSetId: string, spriteId: number, preset: string) => void
    setCollisions: (spriteSetId: string, spriteIds: number[], preset: string) => void
    setShapes: (spriteSetId: string, spriteId: number, shapes: ColliderShape[]) => void
    setSurface: (spriteSetId: string, spriteId: number, surface: string | null) => void
    setTerrain: (spriteSetId: string, draft: TerrainDraft) => void
    removeTerrain: (spriteSetId: string, terrainId: string) => void
    tilesetUsage: (spriteSetId: string) => number
  }): void {
    this._onCollisionChanged = callbacks.setCollision
    this._onCollisionsChanged = callbacks.setCollisions
    this._onShapesChanged = callbacks.setShapes
    this._onSurfaceChanged = callbacks.setSurface
    this._onTerrainSaved = callbacks.setTerrain
    this._onTerrainDeleted = callbacks.removeTerrain
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
   * the shared preview-resource map into the Graphics page. Called by
   * the host on every cast-controller refresh (project load + any
   * sprite-set or animation mutation). Preserves the active appearance
   * across re-pushes so an in-flight animation edit keeps its detail.
   */
  setAppearances(sheets: SpriteSetChoice[], spriteSetsById: Map<string, GdkSpriteSetResource | null>): void {
    this._appearances = sheets
    this._appearanceSetsById = spriteSetsById
    // A deleted active appearance leaves no selection — not the next
    // sheet in line, which nobody chose.
    if (this._activeAppearanceId && !sheets.find((s) => s.id === this._activeAppearanceId)) {
      this._activeAppearanceId = null
    }
    // Nothing selected in EITHER section: a project of appearances only
    // (no tilesets) still gets a filled detail. Set before the rebuild
    // so the card lights in the same pass.
    if (!this._active && !this._activeAppearanceId && sheets.length > 0) {
      this._activeAppearanceId = sheets[0]?.id ?? null
      this._activeKind = 'appearance'
      this._autoSelected = true
    }
    this._rebuildAppearancesGallery()
    // If the user is currently on an appearance, refresh it (e.g. an
    // animation edit changed the count). Tileset details are untouched.
    if (this._activeKind === 'appearance') this._refreshDetail()
    this._notifyActiveItem()
  }

  /**
   * Replace the view's data from a freshly loaded project resource.
   * Called by the host when entering the Library's Graphics chip and
   * after any tile-property mutation or tileset create/delete so the
   * gallery + detail reflect the persisted state.
   */
  async setProject(project: GameProjectResource | null): Promise<void> {
    if (!project) {
      this._clearProject()
      return
    }

    this._spriteSets = await loadTilesetEntries(project)
    this._mapUsage = countMapUsers(project)

    // Keep the active tileset if still present. Otherwise fall back to
    // the first one — but only when the OTHER section holds no selection
    // a person made, so a showing appearance glance is not yanked away.
    const keepId =
      this._active && this._spriteSets.some((entry) => entry.id === this._active?.id)
        ? (this._active?.id ?? null)
        : null
    const showingPickedAppearance = this._activeKind === 'appearance' && !this._autoSelected
    const fallbackId = showingPickedAppearance ? null : (this._spriteSets[0]?.id ?? null)
    await this._syncPalette(keepId ?? fallbackId)
    if (!keepId && fallbackId) {
      // Tilesets lead the gallery, so they win the provisional pick that
      // `setAppearances` may have made before this list existed.
      const wasAppearance = this._activeKind === 'appearance'
      this._activeKind = 'tileset'
      this._autoSelected = true
      if (wasAppearance) this._rebuildAppearancesGallery()
    }
    this._rebuildGallery()
    if (this._activeKind === 'tileset') this._refreshDetail()
    this._notifyActiveItem()
  }

  /** Select a tileset by id + show its detail (host / MCP entry). */
  focusTileset(id: string): void {
    this._selectTileset(id)
  }

  /**
   * Select an appearance (sprite-sheet) by id, show its glance and
   * scroll its card into view — the Appearances section sits below the
   * tilesets, so a deep link would otherwise light a card the user
   * cannot see. Used by the `win.open-appearance` action + the character
   * detail's "Edit animations" deep-link (asset management). Animations
   * are authored under Characters — the glance's button jumps there.
   */
  focusAppearance(id: string): void {
    this._selectAppearance(id)
    this._appearances_gallery.revealActive()
  }

  /**
   * Present the sprite-set import dialog as the "New tileset" flow. On
   * import it emits `spriteset-imported` with the result; the host runs
   * the shared copy + register + broadcast path and re-hydrates this
   * view. Reuses the exact dialog the Cast view uses for sprite-sets.
   */
  get fullView(): boolean {
    return this._fullView ?? false
  }

  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this.notify('full-view')
  }

  presentTilesetImportDialog(): void {
    presentSpriteSetImport(this, 'tileset', this.fullView, (result) => {
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
    presentSpriteSetImport(this, 'character', this.fullView, (result) => {
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
   * Re-hatch the palette after a collision edit landed on the shown set.
   * Separate from {@link refreshInspectorForSelection} because the
   * inspector describes ONE tile while the hatch covers the whole grid.
   */
  refreshTileCollision(): void {
    this._detail?.setPaletteCollision(this._collisionFor(this._active?.id ?? null))
  }

  /**
   * Re-read how many ground brushes the shown set has, after one was
   * defined or deleted — here rather than inside the dialog, so a
   * brush a PEER defined updates the row too.
   */
  refreshTerrainCount(): void {
    this._detail?.setTerrainCount(this._activeSpriteSet()?.resource.data?.terrains?.length ?? 0)
  }

  /**
   * Id of the selected tileset or appearance, for presence. Both
   * sections share one id space as far as a peer is concerned — the
   * place is "which graphic is Mia looking at", not which gallery.
   */
  get activeItemId(): string {
    return (this._activeKind === 'appearance' ? this._activeAppearanceId : this._active?.id) ?? ''
  }

  /**
   * Show who has each graphic open, keyed by sprite-set id (§ 4.7).
   * One map feeds both galleries; each only finds its own ids.
   */
  setPeerMarkers(byId: ReadonlyMap<string, readonly PeerMarker[]>): void {
    this._tilesets_gallery.setPeerMarkers(byId)
    this._appearances_gallery.setPeerMarkers(byId)
  }

  /**
   * Notify `active-item-id` when it actually moved. The selection is
   * spread over three fields written by four callers, so each writer
   * calls this instead of trying to notify precisely.
   */
  private _notifyActiveItem(): void {
    const id = this.activeItemId
    if (id === this._announcedItemId) return
    this._announcedItemId = id
    this.notify('active-item-id')
  }

  private _clearProject(): void {
    this._spriteSets = []
    this._active = null
    this._selectedSpriteId = null
    this._activeKind = 'tileset'
    this._activeAppearanceId = null
    this._autoSelected = false
    this._tilesets_gallery.setItems([])
    this._detail?.clearPalette()
    this._detail?.setSprite(null, null)
    this._refreshDetail()
    this._notifyActiveItem()
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
        return entry ? buildTilesetPreview(entry.gdk) : null
      },
    )
    // Only one card across both galleries is lit — the active selection's.
    this._tilesets_gallery.setActiveId(this._activeKind === 'tileset' ? (this._active?.id ?? null) : null)
  }

  /**
   * Select a tileset: make it the active selection, refresh the detail
   * + (lazily) the palette, and highlight the card (clearing any
   * appearance highlight). Mirrors {@link _selectAppearance} so both
   * sections behave identically.
   */
  private _selectTileset(id: string): void {
    const entry = this._spriteSets.find((s) => s.id === id)
    if (!entry) return
    this._activeKind = 'tileset'
    this._autoSelected = false
    // Start with the tile-properties sheet closed — no tile picked yet.
    this._detail?.revealTileSheet(false)
    this._tilesets_gallery.setActiveId(id)
    this._appearances_gallery.setActiveId(null)
    // `_syncPalette` moves `_active` synchronously before its first
    // await, so the detail below already describes the new selection.
    void this._syncPalette(id)
    this._refreshDetail()
    this._notifyActiveItem()
    this.emit('detail-requested')
  }

  /**
   * Render the active selection into the detail pane and name it for the
   * host's one header — the SINGLE emitter of `detail-title`.
   *
   * Deliberately never emits `detail-requested`: this also runs for a
   * selection the page made by itself (first paint, a re-hydrate), and
   * drilling a collapsed split into a detail nobody asked for is how the
   * phone used to land in the palette on project load.
   */
  private _refreshDetail(): void {
    if (this._activeKind === 'appearance') this._showAppearanceDetail()
    else this._showTilesetDetail()
  }

  private _showAppearanceDetail(): void {
    const character = this._sheetAsCharacter(this._activeAppearanceId)
    if (!character) {
      this.emit('detail-title', _('Graphics'))
      this._detail?.showEmpty()
      return
    }
    const sheet = this._activeAppearanceId ? (this._appearanceSetsById.get(this._activeAppearanceId) ?? null) : null
    this.emit('detail-title', character.name)
    this._detail?.showAppearance({
      character,
      spriteSet: sheet,
      subtitle: animationCountLabel(sheet?.data?.characterAnimations?.length ?? 0),
    })
  }

  private _showTilesetDetail(): void {
    const active = this._activeSpriteSet()
    if (!active) {
      this.emit('detail-title', _('Graphics'))
      this._detail?.showEmpty()
      return
    }
    this.emit('detail-title', tilesetName(active))
    this._detail?.showTileset()
    this._detail?.setTerrainCount(active.resource.data?.terrains?.length ?? 0)
  }

  private _activeSpriteSet(): TilesetEntry | null {
    const id = this._active?.id
    return id ? (this._spriteSets.find((s) => s.id === id) ?? null) : null
  }

  /**
   * The ONE writer of {@link _active} and of the palette's contents.
   *
   * Moves the selection to `id` (synchronously, before the first await,
   * so the gallery + detail already describe it), loads that set's
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
    this._notifyActiveItem()
    // The sprite-sheet aware loader auto-adopts the sheet's native column
    // count, so a set renders in its canonical grid (32×N for
    // kokiri-forest) instead of an arbitrary wrap.
    if (sheet) this._detail?.setPaletteFromSpriteSheet(sheet, this._collisionFor(id))
    else this._detail?.clearPalette()
    this._refreshInspector()
  }

  /**
   * What every tile of a set blocks, for the palette's "Show walls"
   * hatch. Only solid tiles are listed, so a 1024-tile set with a
   * handful of walls carries a handful of entries.
   */
  private _collisionFor(id: string | null): TileCollisionMap | null {
    const entry = id ? this._spriteSets.find((s) => s.id === id) : null
    const sprites = entry?.resource.data?.sprites
    return sprites ? spriteSetCollisionRefs(sprites) : null
  }

  private _selectTile(tileId: number): void {
    // Picking a tile refreshes the inspector. On phone that means sliding
    // the bottom sheet up; on desktop the sidebar is already visible, so it
    // just updates in place. A palette that isn't this set's own grid has
    // no tile to select (see `_syncPalette`).
    if (!editableTilesetId(this._active)) return
    this._selectedSpriteId = tileId
    this._refreshInspector()
    this._detail?.revealTileSheet(true)
  }

  /** The phone sheet's close button: slide it back down + drop the selection. */
  private _clearTileSelection(): void {
    this._detail?.revealTileSheet(false)
    this._selectedSpriteId = null
    this._refreshInspector()
  }

  private _refreshInspector(): void {
    const active = this._activeSpriteSet()
    if (!active || this._selectedSpriteId == null) {
      this._detail?.setSprite(null, null)
      return
    }
    const data = active.resource.data
    const def: SpriteDataSet | undefined = data?.sprites.find((s) => s.id === this._selectedSpriteId)
    const sprite = active.gdk?.getSprite(this._selectedSpriteId)
    // The sheet's grid decides which collision pictogram a stored shape
    // matches — a half-tile box is 8 px on a 16 px sheet, 16 on a 32 px one.
    const tileSize = data ? { width: data.spriteWidth, height: data.spriteHeight } : undefined
    this._detail?.setSprite(def ?? null, sprite?.createPaintable() ?? null, tileSize)
  }

  /**
   * The sprite-set id a tile-property edit is attributed to. Only a set
   * whose OWN grid is on screen qualifies — see {@link _syncPalette}.
   */
  private _editableTilesetId(): string | null {
    return editableTilesetId(this._active)
  }

  private _applyCollision(preset: string): void {
    const id = this._editableTilesetId()
    if (!id || this._selectedSpriteId == null) return
    this._onCollisionChanged?.(id, this._selectedSpriteId, preset)
  }

  /**
   * One Wall-brush stroke. Unlike {@link _applyCollision} this carries
   * its own tile ids — the stroke paints what the pointer crossed, which
   * has nothing to do with the inspector's single selection (paint mode
   * clears it).
   */
  private _applyCollisions(tileIds: number[], preset: string): void {
    const id = this._editableTilesetId()
    if (!id || tileIds.length === 0) return
    this._onCollisionsChanged?.(id, tileIds, preset)
  }

  /**
   * Open the Full-view shape editor on the selected tile.
   *
   * The dialog is built per visit rather than kept around: it is a rare
   * surface, and a fresh one cannot carry a previous tile's draft into
   * the next tile by accident. Presenting from the app layer mirrors
   * {@link _presentRenameTileset} — the pane reports the gesture, the
   * view owns the dialog and the store write.
   */
  private _presentShapeEditor(): void {
    const id = this._editableTilesetId()
    const active = this._activeSpriteSet()
    if (!id || !active || this._selectedSpriteId == null) return
    const data = active.resource.data
    const def = data?.sprites.find((s) => s.id === this._selectedSpriteId)
    if (!data || !def) return

    const spriteId = this._selectedSpriteId
    const dialog = new TileShapeDialog()
    dialog.setTile(
      active.gdk?.getSprite(spriteId) ?? null,
      { width: data.spriteWidth, height: data.spriteHeight },
      def.colliders ?? [],
      def.name ?? _('Tile %d').replace('%d', String(spriteId)),
    )
    dialog.connect('shapes-saved', (_d: TileShapeDialog, shapes: ColliderShape[]) => {
      this._onShapesChanged?.(id, spriteId, shapes)
    })
    dialog.present(this)
  }

  /**
   * Open the ground-brush dialog on the shown tileset (TERRAIN.md § 5).
   *
   * Built per visit like {@link _presentShapeEditor}, and handed the
   * set's texture plus a paintable reader rather than the set itself:
   * the dialog draws the sheet and the live sample, and never learns
   * what a project is.
   *
   * The paintables are cached for the dialog's lifetime — the sample is
   * 140 cells and redraws on every nudge, so a fresh paintable per cell
   * per frame would be 140 allocations a keystroke.
   */
  private _presentTerrainDialog(target: string): void {
    const id = this._editableTilesetId()
    const active = this._activeSpriteSet()
    const data = active?.resource.data
    const texture = active?.gdk?.imageTexture?.texture
    if (!id || !active || !data || !texture) return

    const paintables = new Map<number, Gdk.Paintable | null>()
    const dialog = new TerrainDefineDialog()
    // Before the sheet: the tier decides which preset cards exist.
    dialog.setFullView(this.fullView)
    dialog.setSheet(
      {
        texture,
        grid: sheetGridOf(data, texture.get_width(), texture.get_height()),
        paintable: (spriteId) => {
          if (!paintables.has(spriteId)) {
            paintables.set(spriteId, active.gdk?.getSprite(spriteId)?.createPaintable() ?? null)
          }
          return paintables.get(spriteId) ?? null
        },
        isSolid: (spriteId) => data.sprites.find((sprite) => sprite.id === spriteId)?.solid === true,
        floorSpriteId: floorSpriteIdOf(data),
      },
      data.terrains ?? [],
    )
    dialog.connect('terrain-saved', (_d: TerrainDefineDialog, draft: TerrainDraft) => {
      this._onTerrainSaved?.(id, draft)
    })
    dialog.connect('terrain-deleted', (_d: TerrainDefineDialog, terrainId: string) => {
      this._onTerrainDeleted?.(id, terrainId)
    })
    dialog.openAt(target)
    dialog.present(this)
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

  // ── Appearances (character sprite sheets) ─────────────────────────

  /**
   * Rebuild the appearance cards. Each previews the sheet's animations
   * via a showcase `CharacterPreview` bound to a synthetic character
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
   * Select an appearance: make it the active selection, show its glance
   * in the detail, and highlight the card (clearing any tileset
   * highlight). Mirrors {@link _selectTileset} so both sections behave
   * identically.
   */
  private _selectAppearance(id: string): void {
    const sheet = this._appearances.find((s) => s.id === id)
    if (!sheet) return
    this._activeAppearanceId = id
    this._activeKind = 'appearance'
    this._autoSelected = false
    this._appearances_gallery.setActiveId(id)
    this._tilesets_gallery.setActiveId(null)
    this._refreshDetail()
    this._notifyActiveItem()
    this.emit('detail-requested')
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
