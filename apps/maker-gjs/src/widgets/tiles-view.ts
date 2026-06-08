import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { GameProjectResource, SpriteDataSet, SpriteSetResource } from '@pixelrpg/engine'
import {
  CardGallery,
  type EditorMode,
  type GalleryCardItem,
  GdkSpriteSetResource,
  type ModeRail,
  SignalScope,
  SpriteSetImportDialog,
  type SpriteSetImportResult,
  TileInspector,
  TilePalette,
} from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import Template from './tiles-view.blp'

// Force registration so blueprint `$PixelRpg…` refs resolve at parse time.
GObject.type_ensure(TilePalette.$gtype)
GObject.type_ensure(TileInspector.$gtype)
GObject.type_ensure(CardGallery.$gtype)

/** Built-in sprite sets (engine-provided) have no project files to remove. */
function isBuiltInSpriteSet(id: string): boolean {
  return id.startsWith('built-in:')
}

interface TilesetEntry {
  id: string
  resource: SpriteSetResource
  gdk: GdkSpriteSetResource | null
}

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
export class TilesView extends Adw.Bin {
  declare _mode_rail: ModeRail
  declare _inspector: TileInspector
  declare _palette: TilePalette
  declare _tilesets_gallery: CardGallery
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
  // Desktop gallery quick-view (read-only glance for the selected tileset).
  declare _quick_stack: Gtk.Stack
  declare _quick_thumb: Gtk.Picture
  declare _quick_name: Gtk.Label
  declare _quick_count: Gtk.Label
  declare _quick_edit: Gtk.Button

  private _projectName = ''
  // Sidebar visibility starts CLOSED — overwritten on window
  // construction by `ApplicationWindow._shareSidebarState`'s
  // SYNC_CREATE bind, so the actual sidebar state follows whatever
  // the user last left it across views.
  private _showLibrary = false
  private _showInspector = false
  // Quick-view shown on desktop; flipped off when the breakpoint collapses.
  private _showQuickview = true
  private _libraryCollapsed = false
  private _inspectorCollapsed = false

  private signals = new SignalScope()
  private _spriteSets: TilesetEntry[] = []
  private _activeSpriteSetId: string | null = null
  private _selectedSpriteId: number | null = null

  private _onSolidChanged: ((spriteSetId: string, spriteId: number, solid: boolean) => void) | null = null
  private _onSurfaceChanged: ((spriteSetId: string, spriteId: number, surface: string | null) => void) | null = null

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
          'nav',
          'detail_page',
          'tile_split',
          'tile_sheet',
          'sheet_close',
          'sheet_slot',
          'side_slot',
          'quick_stack',
          'quick_thumb',
          'quick_name',
          'quick_count',
          'quick_edit',
        ],
        Properties: {
          'project-name': GObject.ParamSpec.string(
            'project-name',
            'Project Name',
            'Display name fed into the ModeRail hero block',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'show-library': GObject.ParamSpec.boolean(
            'show-library',
            'Show Library',
            'Whether the mode-rail sidebar is shown',
            GObject.ParamFlags.READWRITE,
            true,
          ),
          'show-inspector': GObject.ParamSpec.boolean(
            'show-inspector',
            'Show Inspector',
            'Whether the right inspector is shown',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'show-quickview': GObject.ParamSpec.boolean(
            'show-quickview',
            'Show Quick-view',
            "Whether the gallery's right quick-view sidebar is shown (desktop)",
            GObject.ParamFlags.READWRITE,
            true,
          ),
          'library-collapsed': GObject.ParamSpec.boolean(
            'library-collapsed',
            'Library Collapsed',
            'Whether the library should auto-overlay (responsive breakpoint)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'inspector-collapsed': GObject.ParamSpec.boolean(
            'inspector-collapsed',
            'Inspector Collapsed',
            'Whether the inspector should auto-overlay (responsive breakpoint)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
        Signals: {
          'mode-changed': { param_types: [GObject.TYPE_STRING] },
          'tile-changed': {},
          // A tileset was imported via this view's dialog — payload is
          // the `SpriteSetImportResult`. The host routes it to the
          // shared sprite-set import path (copy + register + broadcast).
          'spriteset-imported': { param_types: [GObject.TYPE_JSOBJECT] },
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
  }

  /**
   * Move the single tile inspector into the slot that matches the
   * current responsive layout: the pinned right `side_panel` on desktop,
   * or the `tile_sheet` bottom-sheet revealer on phone. Toggles the
   * sidebar's visibility to match.
   */
  private _placeInspector(): void {
    const collapsed = this._inspectorCollapsed
    const target = collapsed ? this._sheet_slot : this._side_slot
    const current = this._inspector.get_parent()
    if (current !== target) {
      if (current) (current as Gtk.Box).remove(this._inspector)
      target.append(this._inspector)
    }
    // Desktop: show the split's pinned sidebar. Phone: hide it (the
    // inspector lives in the bottom sheet instead).
    this._tile_split.set_show_sidebar(!collapsed)
    // The phone bottom sheet only reveals on tile-select; on desktop the
    // sidebar is always shown, so keep the sheet closed.
    if (!collapsed) this._tile_sheet.set_reveal_child(false)
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
    this.signals.connect(this._tilesets_gallery, 'item-activated', (_v: CardGallery, id: string) => {
      this._setActiveSpriteSet(id)
    })
    this.signals.connect(this._tilesets_gallery, 'item-opened', (_v: CardGallery, id: string) => {
      this._setActiveSpriteSet(id)
      this._openDetail()
    })
    this.signals.connect(this._tilesets_gallery, 'delete-requested', (_v: CardGallery, id: string) => {
      this._confirmDeleteTileset(id)
    })
    this.signals.connect(this._quick_edit, 'clicked', () => this._openDetail())
    this.signals.connect(this._palette, 'tile-selected', (_p: TilePalette, tileId: number) => {
      // Picking a tile refreshes the inspector. On phone that means
      // sliding the bottom sheet up; on desktop the sidebar is already
      // visible, so it just updates in place.
      this._selectedSpriteId = tileId
      this._refreshInspector()
      if (this._inspectorCollapsed) this._tile_sheet.set_reveal_child(true)
    })
    // The sheet's close button slides it back down + clears the selection.
    this.signals.connect(this._sheet_close, 'clicked', () => {
      this._tile_sheet.set_reveal_child(false)
      this._selectedSpriteId = null
      this._refreshInspector()
    })
    this.signals.connect(this._inspector, 'solid-changed', (_v: TileInspector, solid: boolean) => {
      const active = this._activeSpriteSet()
      if (!active || this._selectedSpriteId == null) return
      this._onSolidChanged?.(active.id, this._selectedSpriteId, solid)
    })
    this.signals.connect(this._inspector, 'surface-changed', (_v: TileInspector, surface: string) => {
      const active = this._activeSpriteSet()
      if (!active || this._selectedSpriteId == null) return
      this._onSurfaceChanged?.(active.id, this._selectedSpriteId, surface === '' ? null : surface)
    })
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

  get showLibrary(): boolean {
    return this._showLibrary
  }

  set showLibrary(value: boolean) {
    if (this._showLibrary === value) return
    this._showLibrary = value
    this.notify('show-library')
  }

  get showInspector(): boolean {
    return this._showInspector
  }

  set showInspector(value: boolean) {
    if (this._showInspector === value) return
    this._showInspector = value
    this.notify('show-inspector')
  }

  get showQuickview(): boolean {
    return this._showQuickview ?? true
  }

  set showQuickview(value: boolean) {
    if (this._showQuickview === value) return
    this._showQuickview = value
    this.notify('show-quickview')
  }

  get libraryCollapsed(): boolean {
    return this._libraryCollapsed
  }

  set libraryCollapsed(value: boolean) {
    if (this._libraryCollapsed === value) return
    this._libraryCollapsed = value
    this.notify('library-collapsed')
  }

  get inspectorCollapsed(): boolean {
    return this._inspectorCollapsed
  }

  set inspectorCollapsed(value: boolean) {
    if (this._inspectorCollapsed === value) return
    this._inspectorCollapsed = value
    this.notify('inspector-collapsed')
    // Collapsed = narrow/phone → hide the gallery quick-view (a tap
    // drills straight into the detail page). Expanded = desktop → show.
    this.showQuickview = !value
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
  }): void {
    this._onSolidChanged = callbacks.setSolid
    this._onSurfaceChanged = callbacks.setSurface
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
      this._spriteSets = []
      this._activeSpriteSetId = null
      this._selectedSpriteId = null
      this._tilesets_gallery.setItems([])
      this._palette.setTiles([])
      this._inspector.setSprite(null, null)
      this._refreshQuickView()
      return
    }

    // Tiles shows ONLY world tilesets — character animation sheets
    // belong to the Cast view. Exclude any set tagged `kind: 'character'`
    // AND any set a character references (belt-and-suspenders: catches
    // legacy/untagged sheets like a project that predates the split).
    const usedByCharacter = new Set((project.data?.characters ?? []).map((c) => c.spriteSetId))

    // Snapshot sprite-sets in project order, wrapping each as a GTK
    // resource up-front so its card can show a sheet thumbnail. Tilesets
    // are few (a handful per project) so eager wrapping is cheap and
    // keeps the gallery from popping in thumbnails one by one.
    const items: TilesetEntry[] = []
    for (const [id, resource] of project.spriteSets) {
      if (resource.data?.kind === 'character' || usedByCharacter.has(id)) continue
      let gdk: GdkSpriteSetResource | null = null
      try {
        gdk = await GdkSpriteSetResource.fromEngineResource(resource)
      } catch (err) {
        console.warn('[TilesView] Failed to wrap sprite-set for thumbnail:', err)
      }
      items.push({ id, resource, gdk })
    }
    this._spriteSets = items

    // Keep the active selection if still present; otherwise fall back
    // to the first set.
    if (!this._activeSpriteSetId || !items.some((i) => i.id === this._activeSpriteSetId)) {
      this._activeSpriteSetId = items[0]?.id ?? null
    }
    this._rebuildGallery()
    this._refreshQuickView()
    await this._loadActivePalette()
  }

  /** Sync the ModeRail's active mode (called when the host changes view). */
  syncActiveMode(mode: EditorMode): void {
    this._mode_rail.activeMode = mode
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
    this._setActiveSpriteSet(id)
    this._openDetail()
  }

  /**
   * Present the sprite-set import dialog as the "New tileset" flow. On
   * import it emits `spriteset-imported` with the result; the host runs
   * the shared copy + register + broadcast path and re-hydrates this
   * view. Reuses the exact dialog the Cast view uses for sprite-sets.
   */
  presentTilesetImportDialog(): void {
    const dialog = new SpriteSetImportDialog()
    dialog.kind = 'tileset'
    dialog.connect('spriteset-imported', (_d: SpriteSetImportDialog, result: SpriteSetImportResult) => {
      this.emit('spriteset-imported', result)
    })
    dialog.present(this)
  }

  private _rebuildGallery(): void {
    this._tilesets_gallery.setItems(this._spriteSets.map((entry) => this._buildTilesetItem(entry)))
    this._tilesets_gallery.setActiveId(this._activeSpriteSetId)
  }

  /**
   * Card model for one tileset: a downscaled thumbnail of the whole
   * sheet as the preview (the recognisable mosaic — far more useful than
   * any single tile, which is often an empty eraser cell — bounded so
   * the card grids compactly), the sprite count as subtitle, deletable
   * only for project sets (built-ins have no files + can't be removed).
   */
  private _buildTilesetItem(entry: TilesetEntry): GalleryCardItem {
    const count = entry.resource.data?.sprites?.length ?? 0
    return {
      id: entry.id,
      title: entry.resource.data?.name ?? entry.id,
      subtitle: count === 1 ? _('1 tile') : _(`${count} tiles`),
      paintable: entry.gdk?.createSheetThumbnail() ?? null,
      fallbackIcon: 'view-grid-symbolic',
      deletable: !isBuiltInSpriteSet(entry.id),
    }
  }

  /**
   * Select a tileset: make it active, refresh the quick-view + (lazily)
   * the palette, and highlight the card. On a NARROW layout (no
   * quick-view sidebar) this also drills into the detail page; on
   * desktop it just updates the quick-view (the user opens the detail
   * explicitly via double-click or the "Edit" button).
   */
  private _setActiveSpriteSet(id: string): void {
    const entry = this._spriteSets.find((s) => s.id === id)
    if (!entry) return
    this._activeSpriteSetId = id
    this._selectedSpriteId = null
    // Start with the tile-properties sheet closed — no tile picked yet.
    this._tile_sheet.set_reveal_child(false)
    this._tilesets_gallery.setActiveId(id)
    this._detail_page.title = entry.resource.data?.name ?? id
    this._refreshQuickView()
    void this._loadActivePalette()
    if (this._inspectorCollapsed) this._openDetail()
  }

  /**
   * Drill into the detail sub-page (tile palette + inspector) for the
   * active tileset. No-op if already there. The inspector stays closed
   * until the user picks a tile (it has nothing to show for a whole
   * set), matching the palette's tile-selected auto-open.
   */
  private _openDetail(): void {
    if (!this._activeSpriteSetId) return
    if (this._nav.get_visible_page()?.tag !== 'detail') this._nav.push_by_tag('detail')
  }

  /**
   * Populate the desktop quick-view sidebar (read-only glance) for the
   * active tileset, or switch it to the empty state when none is active.
   */
  private _refreshQuickView(): void {
    const active = this._activeSpriteSet()
    if (!active) {
      this._quick_stack.set_visible_child_name('empty')
      this._quick_thumb.set_paintable(null)
      return
    }
    this._quick_stack.set_visible_child_name('info')
    this._quick_thumb.set_paintable(active.gdk?.createSheetThumbnail(240) ?? null)
    this._quick_name.set_label(active.resource.data?.name ?? active.id)
    const count = active.resource.data?.sprites?.length ?? 0
    this._quick_count.set_label(count === 1 ? _('1 tile') : _(`${count} tiles`))
  }

  private _activeSpriteSet(): TilesetEntry | null {
    if (!this._activeSpriteSetId) return null
    return this._spriteSets.find((s) => s.id === this._activeSpriteSetId) ?? null
  }

  private async _loadActivePalette(): Promise<void> {
    const active = this._activeSpriteSet()
    if (!active) {
      this._palette.setTiles([])
      this._inspector.setSprite(null, null)
      return
    }
    if (!active.gdk) {
      try {
        active.gdk = await GdkSpriteSetResource.fromEngineResource(active.resource)
      } catch (err) {
        console.warn('[TilesView] Failed to load sprite-set for palette:', err)
        return
      }
    }
    const sheet = active.gdk.spriteSheet
    if (!sheet) return
    // Use the palette's sprite-sheet aware loader — it auto-adopts the
    // sheet's native column count (32 for lokiri-forest, so the
    // tile-set renders in its canonical 32×N grid). Pattern mirrors
    // the `TilePaletteSpriteSheetStory` reference impl that the user
    // pointed at: native columns + tile-size 32 + a horizontal scroll
    // on the surrounding ScrolledWindow.
    this._palette.setFromSpriteSheet(sheet)
    this._refreshInspector()
  }

  /**
   * Push the selected tile's properties into the inspector. Called
   * after every selection change + after host-driven mutations so
   * the inspector mirrors the latest persisted state.
   */
  refreshInspectorForSelection(): void {
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
   * Confirm + request deletion of a tileset. Destructive (removes the
   * project's `<id>.png` + `<id>.json` and, in collab, broadcasts the
   * removal) so it routes through an `Adw.AlertDialog` first; the host
   * does the actual removal on confirm.
   */
  private _confirmDeleteTileset(id: string): void {
    const entry = this._spriteSets.find((s) => s.id === id)
    if (!entry || isBuiltInSpriteSet(id)) return
    const name = entry.resource.data?.name ?? id
    const dialog = new Adw.AlertDialog({
      heading: _('Delete tileset?'),
      body: _(
        `“${name}” and its image will be removed from the project. Tiles painted with it may break. This cannot be undone.`,
      ),
    })
    dialog.add_response('cancel', _('Cancel'))
    dialog.add_response('delete', _('Delete'))
    dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE)
    dialog.set_default_response('cancel')
    dialog.set_close_response('cancel')
    dialog.connect('response', (_d: Adw.AlertDialog, response: string) => {
      if (response === 'delete') this.emit('spriteset-delete-requested', id)
    })
    dialog.present(this)
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(TilesView.$gtype)
