import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { EditorTool } from '@pixelrpg/engine'
import {
  type EditorMode,
  type Engine,
  GdkSpriteSetResource,
  type GdkSpriteSheet,
  type LayerDescriptor,
  type LayersTab,
  ModeRail,
  RightInspector,
  type SampleScene,
  SceneEditor,
  SignalScope,
  type TileDescriptor,
  TilePalette,
  type TilesTab,
} from '@pixelrpg/gjs'
import type { LoadedProject } from '../services/project-loader.ts'

import Template from './scene-editor-view.blp'

GObject.type_ensure(ModeRail.$gtype)
GObject.type_ensure(SceneEditor.$gtype)
GObject.type_ensure(RightInspector.$gtype)

/**
 * Maker-app **Scene Editor** view.
 *
 * Outer `Adw.OverlaySplitView` (mode rail, full window height) →
 * `Adw.ToolbarView` with the scene header → inner `Adw.OverlaySplitView`
 * with the {@link SceneEditor} content on the left and the
 * {@link RightInspector} (Tiles · Layers · Props) docked under the
 * header on the right.
 *
 * Owns the tile / layer state synced between three surfaces:
 *
 * 1. The inspector tabs (sidebar)
 * 2. The OSD {@link FloatingTopBar} popovers (tile + layer chips)
 * 3. The engine via `Engine.setEditorState({ tileId, layerId })`
 *
 * `tileId` is sent to the engine as a global tile id
 * (`spriteIndex + firstGid`); the inspector deals in 0-based indices.
 */
export class SceneEditorView extends Adw.Bin {
  declare _mode_rail: ModeRail
  declare _editor: SceneEditor
  declare _inspector: RightInspector

  private signals = new SignalScope()
  private _projectName = "Aria's Quest"
  private _sceneName = ''
  private _libraryCollapsed = false
  private _inspectorCollapsed = false
  // Same reasoning as `_showInspector` below: the `OverlaySplitView`
  // settles on `show-sidebar=false` for the first frame, so starting
  // this property `true` would cause the same multi-step desync where
  // the first click of the library toggle pill is consumed
  // resyncing button↔state and only the second click actually opens
  // the rail. ParamSpec default + class field both `false` keeps every
  // end of the chain consistent.
  private _showLibrary = false
  // Initial inspector visibility matches the `OverlaySplitView`'s own
  // post-layout state. Starting this `true` while the
  // `OverlaySplitView` ends up showing `show-sidebar=false` for the
  // first frame caused a multi-step desync on view-show: the
  // bidirectional bind from `inner_split.show-sidebar` would write
  // `false` back into this property AFTER `bind_property` already
  // synced `true` into `FloatingTopBar.show-inspector`. The button's
  // `active` ended up `true` while the inspector was visually closed,
  // so the first user click toggled `active` back to `false` (closing
  // again) and only the second click opened it. Keeping this `false`
  // from the start keeps all four ends (this property, the
  // OverlaySplitView, the FloatingTopBar's mirror, the button's
  // `active`) consistent.
  private _showInspector = false
  private _engine: Engine | null = null
  private _layers: LayerDescriptor[] = []
  private _tiles: TileDescriptor[] = []
  private _activeTileId: number | null = null
  private _activeLayerId: string | null = null
  private _tilesetName = ''
  /**
   * `firstGid` of the active sprite set. The engine indexes tiles as
   * global IDs (`spriteIndex + firstGid`); the inspector deals in
   * 0-based sprite indices, so this offset bridges the two.
   */
  private _tilesetFirstGid = 1

  static {
    GObject.registerClass(
      {
        GTypeName: 'SceneEditorView',
        Template,
        InternalChildren: ['mode_rail', 'editor', 'inspector'],
        Properties: {
          'project-name': GObject.ParamSpec.string(
            'project-name',
            'Project Name',
            'Name shown in the mode rail hero',
            GObject.ParamFlags.READWRITE,
            'New Project',
          ),
          'scene-name': GObject.ParamSpec.string(
            'scene-name',
            'Scene Name',
            'Title of the scene currently shown in the editor',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          // Per-sidebar collapse flags so the window breakpoint can
          // independently switch each into overlay-drawer mode. The
          // tablet preset wants the library overlay + inspector
          // persistent — impossible to express with a single shared
          // `collapsed` property.
          'library-collapsed': GObject.ParamSpec.boolean(
            'library-collapsed',
            'Library Collapsed',
            'Whether the left library sidebar collapses to an overlay (set by the window breakpoint)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'inspector-collapsed': GObject.ParamSpec.boolean(
            'inspector-collapsed',
            'Inspector Collapsed',
            'Whether the right inspector sidebar collapses to an overlay (set by the window breakpoint)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          // Both sidebars default to *closed*. On desktop the user
          // opens them on demand from the floating toggle pills; on
          // mobile / tablet the breakpoint-driven `collapsed` makes
          // them drawer-style, so `show-…: false` means the drawer
          // is hidden at startup.
          'show-library': GObject.ParamSpec.boolean(
            'show-library',
            'Show library',
            'Whether the library mode rail is visible',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'show-inspector': GObject.ParamSpec.boolean(
            'show-inspector',
            'Show inspector',
            'Whether the right-side inspector is visible',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          // Top-bar density (compact / show-back / show-history /
          // show-grid / show-chip-labels) is driven by an
          // `Adw.BreakpointBin` inside `scene-editor.blp` so it
          // tracks the canvas allocation rather than window width;
          // no passthrough properties needed here.
        },
        Signals: {
          'mode-changed': { param_types: [GObject.TYPE_STRING] },
          // Fired when the active map's `MapData` was mutated in
          // place (e.g. user toggled a layer's visibility or lock
          // flag) and should be serialised back to disk. The host
          // listens because it tracks the project + scene paths
          // needed by `MapFormat.serialize` + `writeTextFile`.
          'persist-requested': { param_types: [] },
        },
      },
      SceneEditorView,
    )
  }

  constructor() {
    super()
    this._mode_rail.projectName = this._projectName
    this._mode_rail.projectTagline = 'Scene editor'
    this._wireInspectorSignals()
    // Round-trip the top bar's inspector_toggle pressed state with
    // this view's `show-inspector`. Without this, the toggle button is
    // only wired to the stateless `win.toggle-inspector` action and its
    // visual `active` never matches the sidebar's actual visibility on
    // first show — the first click is consumed resyncing the button and
    // the inspector only opens on the second click. The atlas-view's
    // inspector_toggle uses the same `bind template.show-inspector
    // bidirectional` pattern directly in its template; we have to do it
    // in code here because FloatingTopBar is a packaged widget two
    // levels down from SceneEditorView and the blueprint binding can't
    // reach up through that nesting.
    this.bind_property(
      'show-inspector',
      this._editor.topBar,
      'show-inspector',
      GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL,
    )
  }

  /** Forward the current zoom level to the floating zoom OSD. */
  setZoom(zoom: number): void {
    this._editor.zoomOsd.setZoom(zoom)
  }

  /**
   * Inject a host-owned engine widget (typically the `Engine` from
   * `@pixelrpg/gjs`) into the scratchpad slot. Passing `null` clears
   * the slot.
   *
   * Also remembers the engine so inspector selections (tile, layer,
   * tool) can be forwarded into `Engine.setEditorState()`.
   *
   * The slot fires synchronously the moment the engine widget is
   * constructed — before its async Excalibur initialisation finishes.
   * Don't try to push session-state writes (`setActiveTile`,
   * `setActiveLayer`) from here: the gjs widget's forwarders no-op
   * while `_excalibur` is null, so the writes silently disappear.
   * The host orchestrator (`_hydrateSceneEditor`) is responsible for
   * ordering `ensureForMap` before `populateFromProject` so the
   * inspector's `_setActiveTile/_setActiveLayer` writes land on a
   * live engine.
   */
  setEngineWidget(widget: Gtk.Widget | null, engine?: Engine | null): void {
    this._editor.setEngine(widget)
    this._engine = engine ?? null
  }

  /** Reflect the `win.play` action's runtime state on the FloatingPlay button. */
  setPlaying(playing: boolean): void {
    this._editor.floatingPlay.playing = playing
  }

  /**
   * Forward the active editor tool to the top bar so its tool
   * MenuButton's icon mirrors the selection. The host calls this
   * from the `win.set-tool` action's change-state handler.
   */
  setActiveTool(tool: EditorTool): void {
    this._editor.topBar.setActiveTool(tool)
  }

  /** Header title + the floating chips. */
  setScene(scene: SampleScene): void {
    this.sceneName = scene.name
    this._editor.topBar.tileName = 'Tile 0'
    this._editor.topBar.layerName = 'Background'
    this._editor.zoomOsd.setZoom(1)
    // Cursor is hidden until the first pointer-move arrives over the
    // canvas — see `setCursorTile`. Calling `setCursor(0, 0)` here
    // would stick a misleading `0, 0` readout on the OSD before the
    // user has even moved the mouse.
    this._editor.zoomOsd.setCursor(null, null)
  }

  /**
   * Push the tile under the pointer to the floating-zoom OSD's coord
   * label. Pass `null, null` to clear the readout (pointer left the
   * canvas / map switched). The OSD widget itself dedupes consecutive
   * identical values — this is just the forwarder.
   */
  setCursorTile(tileX: number | null, tileY: number | null): void {
    this._editor.zoomOsd.setCursor(tileX, tileY)
  }

  /**
   * Populate the right-side inspector tabs from a real loaded project.
   * Reads the active map's layers + first sprite-set from
   * `LoadedProject.resource` and feeds them into the tiles / layers /
   * props tabs.
   */
  async populateFromProject(project: LoadedProject, sceneId: string): Promise<void> {
    const map = await project.resource.getMap(sceneId).catch(() => null)
    const mapData = map ?? project.resource.maps.get(sceneId)?.mapData
    if (!mapData) return

    this._inspector.propsTab.setScene({
      name: mapData.name ?? mapData.id,
      cols: mapData.columns,
      rows: mapData.rows,
      tilePx: mapData.tileWidth,
    })

    // Tile-count per layer now counts both the layer's own sprites and
    // the object placements that reference it via `layerId` — that's
    // the new "what's on this layer" metric since objects no longer
    // live inside `LayerData`.
    const placementsByLayer = new Map<string, number>()
    for (const p of mapData.objectPlacements ?? []) {
      placementsByLayer.set(p.layerId, (placementsByLayer.get(p.layerId) ?? 0) + 1)
    }
    const layers: LayerDescriptor[] = (mapData.layers ?? []).map((layer) => ({
      id: layer.id,
      name: layer.name,
      tileCount: (layer.sprites?.length ?? 0) + (placementsByLayer.get(layer.id) ?? 0),
      visible: layer.visible ?? true,
      locked: layer.locked ?? false,
    }))
    this._layers = layers
    this._inspector.layersTab.setLayers(layers)
    if (layers.length) {
      this._inspector.layersTab.selectLayer(layers[0].id)
      this._setActiveLayer(layers[0].id)
    }

    // Surface the map's object placements in the Objects tab. Each
    // placement resolves its display name from the inline definition
    // (when present) or from the project's `objectLibrary` (when
    // referenced by `defId`); falling back to the placement id keeps
    // the row labelled even if the library lookup misses.
    //
    // Placements with a `sprite` ref additionally get a `Gdk.Paintable`
    // preview attached so the Objects tab renders the actual sprite
    // instead of the kind-fallback icon (decorations / NPCs gain a
    // visible thumbnail). We deduplicate sprite-set loads — most
    // decoration objects share one set, and `getSpriteSet` is async.
    const library = project.resource.data?.objectLibrary ?? []
    const resolvedDefs = (mapData.objectPlacements ?? []).map((p) => ({
      placement: p,
      def: p.inline ?? library.find((d) => d.id === p.defId) ?? null,
    }))
    const objectSpriteSetIds = new Set<string>()
    for (const { def } of resolvedDefs) {
      if (def?.sprite?.spriteSetId) objectSpriteSetIds.add(def.sprite.spriteSetId)
    }
    const gdkSheets = new Map<string, GdkSpriteSheet | null>()
    await Promise.all(
      Array.from(objectSpriteSetIds).map(async (setId) => {
        try {
          const engineSet = await project.resource.getSpriteSet(setId)
          if (!engineSet) {
            gdkSheets.set(setId, null)
            return
          }
          const gdkSet = await GdkSpriteSetResource.fromEngineResource(engineSet)
          gdkSheets.set(setId, gdkSet.spriteSheet ?? null)
        } catch (error) {
          console.warn(`[SceneEditorView] Failed to load sprite set "${setId}" for objects tab:`, error)
          gdkSheets.set(setId, null)
        }
      }),
    )
    const placements = resolvedDefs.map(({ placement, def }) => {
      let paintable = null
      if (def?.sprite) {
        const sheet = gdkSheets.get(def.sprite.spriteSetId)
        const sprite = sheet?.sprites[def.sprite.spriteId]
        paintable = sprite?.createPaintable() ?? null
      }
      return {
        id: placement.id,
        name: def?.name ?? placement.id,
        kind: def?.kind ?? 'custom',
        tileX: placement.tileX,
        tileY: placement.tileY,
        layerId: placement.layerId,
        paintable,
      }
    })
    this._inspector.objectsTab.setObjects(placements)

    // Pick the first sprite set referenced by *this map* — that's the
    // one whose `firstGid` we need to offset against. Fall back to the
    // project-level list if the map doesn't pin a set.
    const mapSpriteSetRef = mapData.spriteSets?.[0]
    const firstSet = mapSpriteSetRef ?? project.resource.data?.spriteSets?.[0]
    if (firstSet) {
      try {
        const engineSet = await project.resource.getSpriteSet(firstSet.id)
        if (engineSet) {
          const gdkSet = await GdkSpriteSetResource.fromEngineResource(engineSet)
          if (gdkSet.spriteSheet) {
            this._inspector.tilesTab.tilesetName = firstSet.id
            this._tilesetName = firstSet.id
            this._tilesetFirstGid = mapSpriteSetRef?.firstGid ?? 1
            const tiles = this._sheetToTiles(gdkSet.spriteSheet)
            this._tiles = tiles
            this._inspector.tilesTab.setTiles(tiles)
            this._refreshContextPopovers()
            if (tiles.length) this._setActiveTile(tiles[0].id, tiles[0].name)
          }
        }
      } catch (error) {
        console.warn('[SceneEditorView] Failed to load sprite set for tiles tab:', error)
      }
    }
  }

  private _sheetToTiles(sheet: GdkSpriteSheet): TileDescriptor[] {
    return sheet.sprites.map((sprite, idx) => ({
      id: idx,
      name: `Tile ${idx}`,
      paintable: sprite.createPaintable(),
    }))
  }

  /**
   * `tileId` here is the 0-based **sprite index** within the active
   * sheet (what the palette emits). The engine consumes **global**
   * tile IDs, so we convert via `tileId + firstGid`.
   *
   * Always re-syncs both surfaces (inspector palette + context chip)
   * so the user can change selection from either entry point and see
   * it reflected in the other. Also pushes the tile's paintable into
   * the chip so the swatch is a live preview instead of a static icon.
   */
  private _setActiveTile(tileId: number, tileName?: string): void {
    // Do NOT short-circuit on `_activeTileId === tileId`. The engine's
    // `ActiveTileComponent` is per-scene; on map switch (or re-entry
    // after `EngineController.dispose`) the new scene's session state
    // starts empty even though `_activeTileId` still holds the previous
    // scene's value. A short-circuit there would leave the engine
    // without an active tile until the user manually picked a swatch
    // — the same shape of bug the startup-order fix addresses.
    this._activeTileId = tileId
    this._editor.topBar.tileName = tileName ?? `Tile ${tileId}`
    const tile = this._tiles.find((t) => t.id === tileId)
    this._editor.topBar.setTilePaintable(tile?.paintable ?? null)
    const globalTileId = tileId + this._tilesetFirstGid
    this._engine?.setActiveTile(globalTileId)
    // Mirror selection back to the inspector palette in case the change
    // came from the top-bar tile popover.
    this._inspector.tilesTab.selectTile(tileId)
  }

  /**
   * Push a tile id given in **global** form (the engine's
   * `ActiveTileComponent.spriteId` shape — `firstGid` already added)
   * into the editor's active-tile state, syncing palette + context
   * chip in the process.
   *
   * Used by the eyedropper: the engine emits `TILE_PICKED` carrying
   * the global id, and the host funnels it back through the
   * existing local-id flow (`_setActiveTile`) so there is exactly
   * one place that drives the palette highlight + chip preview +
   * engine write.
   *
   * Returns `true` when the global id mapped to a tile in the
   * currently-loaded sheet; `false` otherwise (cross-sheet picking
   * would need a sheet-switch step first — out of scope for the
   * first iteration).
   */
  selectTileByGlobalId(globalTileId: number): boolean {
    const localId = globalTileId - this._tilesetFirstGid
    const tile = this._tiles.find((t) => t.id === localId)
    if (!tile) return false
    this._setActiveTile(localId, tile.name)
    return true
  }

  private _setActiveLayer(layerId: string): void {
    // No short-circuit on `_activeLayerId === layerId` — see the
    // comment on `_setActiveTile` for the same reasoning. The engine's
    // per-scene `ActiveLayerComponent` resets on every map load while
    // the view-held id persists, so the populate-from-project replay
    // must always reach the engine.
    this._activeLayerId = layerId
    const layer = this._layers.find((l) => l.id === layerId)
    this._editor.topBar.layerName = layer?.name ?? layerId
    this._engine?.setActiveLayer(layerId)
    // Mirror selection back to the inspector layers tab.
    this._inspector.layersTab.selectLayer(layerId)
  }

  /**
   * Mark the active map's `MapData` as dirty + ask the host to
   * persist. The engine widget owns the live `MapResource` whose
   * `mapData` was just mutated in place (by `setLayerVisible` /
   * `setLayerLocked`); the host has the project + scene paths
   * needed for `MapFormat.serialize` + `writeTextFile` and already
   * runs the same flow for atlas positions, so emitting a signal
   * keeps file I/O out of this widget.
   */
  private _persistMapData(): void {
    this.emit('persist-requested')
  }

  /**
   * Rebuild the active-tile and active-layer popovers under the
   * top-right context chip with the currently loaded tiles + layers.
   */
  private _refreshContextPopovers(): void {
    this._editor.topBar.setTilePopover(this._buildTilePopover())
    this._editor.topBar.setLayerPopover(this._buildLayerPopover())
  }

  private _buildTilePopover(): Gtk.Popover {
    const popover = new Gtk.Popover()
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 8,
      margin_top: 8,
      margin_bottom: 8,
      margin_start: 8,
      margin_end: 8,
    })

    const heading = new Gtk.Label({ label: this._tilesetName || 'Tileset', halign: Gtk.Align.START })
    heading.add_css_class('caption-heading')
    heading.add_css_class('dim-label')
    box.append(heading)

    const scrolled = new Gtk.ScrolledWindow({
      hscrollbar_policy: Gtk.PolicyType.NEVER,
      vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
      min_content_height: 240,
      min_content_width: 280,
    })
    const palette = new TilePalette({ tileSize: 32, columns: 6, tiles: this._tiles })
    if (this._activeTileId != null) palette.selectTile(this._activeTileId)
    palette.connect('tile-selected', (_p, id) => {
      const tile = this._tiles.find((t) => t.id === id)
      this._setActiveTile(id, tile?.name)
    })
    scrolled.set_child(palette)
    box.append(scrolled)

    popover.set_child(box)
    return popover
  }

  private _buildLayerPopover(): Gtk.Popover {
    const popover = new Gtk.Popover()
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 8,
      margin_top: 8,
      margin_bottom: 8,
      margin_start: 8,
      margin_end: 8,
    })

    const heading = new Gtk.Label({ label: 'Active layer', halign: Gtk.Align.START })
    heading.add_css_class('caption-heading')
    heading.add_css_class('dim-label')
    box.append(heading)

    const list = new Gtk.ListBox({
      selection_mode: Gtk.SelectionMode.SINGLE,
      // GtkListBox only fires `row-activated` on single-click when this
      // flag is set. Without it, single-click only *selects* — which is
      // what `LayersTab` listens for, but here we want to commit and
      // dismiss the popover in one click.
      activate_on_single_click: true,
      css_classes: ['boxed-list'],
    })
    list.set_size_request(240, -1)
    for (const layer of this._layers) {
      const row = new Adw.ActionRow({
        title: layer.name,
        subtitle: `${layer.tileCount} tiles`,
        activatable: true,
      })
      ;(row as Adw.ActionRow & { layerId?: string }).layerId = layer.id
      list.append(row)
    }
    if (this._activeLayerId) {
      const idx = this._layers.findIndex((l) => l.id === this._activeLayerId)
      if (idx >= 0) {
        const target = list.get_row_at_index(idx)
        if (target) list.select_row(target)
      }
    }
    list.connect('row-activated', (_l, row) => {
      const id = (row as Gtk.ListBoxRow & { layerId?: string }).layerId
      if (id) {
        this._setActiveLayer(id)
        popover.popdown()
      }
    })
    box.append(list)

    popover.set_child(box)
    return popover
  }

  private _wireInspectorSignals(): void {
    // Inspector → top-bar + engine sync. Connected once per view
    // lifetime; the inspector tabs themselves persist across scene
    // switches, so re-connecting in vfunc_map would double-fire.
    const tiles: TilesTab = this._inspector.tilesTab
    tiles.connect('tile-selected', (_t: TilesTab, tileId: number) => {
      const tile = this._tiles.find((t) => t.id === tileId)
      this._setActiveTile(tileId, tile?.name)
    })
    const layers: LayersTab = this._inspector.layersTab
    layers.connect('layer-selected', (_l: LayersTab, id: string) => {
      this._setActiveLayer(id)
    })
    // Layer flag toggles. Both signals carry (layerId, newValue). We
    // forward to the engine (which mutates MapData + triggers any
    // necessary graphics refresh), persist via the same flow as
    // `_persistAtlasPosition`, and emit our own re-exported signal so
    // `ApplicationWindow` can react (specifically: locking the active
    // layer needs to disable the editing tool actions).
    layers.connect('layer-visibility-toggled', (_l: LayersTab, layerId: string, visible: boolean) => {
      this._engine?.setLayerVisible(layerId, visible)
      // Mirror the new flag into the local cache so subsequent
      // `_setActiveLayer` reads see the up-to-date value (the
      // inspector's own state already updated via property binding).
      const idx = this._layers.findIndex((l) => l.id === layerId)
      if (idx >= 0) this._layers[idx] = { ...this._layers[idx], visible }
      this._persistMapData()
    })
    layers.connect('layer-lock-toggled', (_l: LayersTab, layerId: string, locked: boolean) => {
      this._engine?.setLayerLocked(layerId, locked)
      const idx = this._layers.findIndex((l) => l.id === layerId)
      if (idx >= 0) this._layers[idx] = { ...this._layers[idx], locked }
      this._persistMapData()
    })

    // Object placements: forward inspector selection into the engine's
    // session-singleton via `setSelectedPlacements`. Single-select only
    // for now — marquee/multi-select rides on the same component
    // (`SelectedPlacementsComponent` accepts an array) once a Selection
    // tool lands.
    const objects = this._inspector.objectsTab
    objects.connect('object-selected', (_o: typeof objects, placementId: string) => {
      this._engine?.setSelectedPlacements([placementId])
      // Smoothly pan the canvas to the picked object. Fire-and-forget —
      // we don't care about the promise here, the engine resolves it
      // when the camera move ends (or rejects on an interrupted move,
      // e.g. the user picked a second object before the first pan
      // finished — also fine, the new pan supersedes).
      void this._engine?.focusOnPlacement(placementId)
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

  /** Push the active mode-rail row from the host on every view switch. */
  syncActiveMode(mode: EditorMode): void {
    this._mode_rail.activeMode = mode
  }

  get sceneName(): string {
    return this._sceneName ?? ''
  }

  set sceneName(value: string) {
    if (this._sceneName === value) return
    this._sceneName = value
    this.notify('scene-name')
  }

  get libraryCollapsed(): boolean {
    return this._libraryCollapsed ?? false
  }

  set libraryCollapsed(value: boolean) {
    if (this._libraryCollapsed === value) return
    this._libraryCollapsed = value
    this.notify('library-collapsed')
  }

  get inspectorCollapsed(): boolean {
    return this._inspectorCollapsed ?? false
  }

  set inspectorCollapsed(value: boolean) {
    if (this._inspectorCollapsed === value) return
    this._inspectorCollapsed = value
    this.notify('inspector-collapsed')
  }

  get showLibrary(): boolean {
    return this._showLibrary ?? false
  }

  set showLibrary(value: boolean) {
    if (this._showLibrary === value) return
    this._showLibrary = value
    this.notify('show-library')
  }

  get showInspector(): boolean {
    return this._showInspector ?? false
  }

  set showInspector(value: boolean) {
    if (this._showInspector === value) return
    this._showInspector = value
    this.notify('show-inspector')
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._mode_rail, 'mode-changed', (_r: ModeRail, mode: string) => {
      this.emit('mode-changed', mode as EditorMode)
    })
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(SceneEditorView.$gtype)
