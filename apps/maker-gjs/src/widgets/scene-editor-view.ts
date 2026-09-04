import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { type EditorTool, type MapData, resolvePlacementDefinition } from '@pixelrpg/engine'
import {
  type CollaboratorEntry,
  type EditorMode,
  type Engine,
  GdkSpriteSetResource,
  type GdkSpriteSheet,
  type LayerDescriptor,
  ModeRail,
  RightInspector,
  type SampleScene,
  SceneEditor,
  SignalScope,
  type TileDescriptor,
} from '@pixelrpg/gjs'
import { toLayerDescriptors } from '../services/layer-descriptors.ts'
import type { LoadedProject } from '../services/project-loader.ts'
import { ResponsiveEditorView } from './responsive-editor-view.ts'
import Template from './scene-editor-view.blp'
import { buildLayerPopover, buildObjectPopover, buildTilePopover } from './scene-editor/context-popovers.ts'
import { wireLayersTab, wireObjectsTab, wirePropsTab, wireTilesTab } from './scene-editor/inspector-wiring.ts'
import {
  buildBrushOptions,
  buildPlacementRows,
  loadObjectSheets,
  type ObjectBrushOption,
  spriteSetIdsFor,
} from './scene-editor/object-descriptors.ts'

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
 * The active tile and layer live ONLY on the engine's session singleton
 * (`ActiveTileComponent` / `ActiveLayerComponent`); this view holds no
 * copy. It writes them through {@link _setActiveTile} /
 * {@link _setActiveLayer} and reads them back through
 * {@link _activeTileIndex} / {@link _activeLayerId} to re-render the two
 * surfaces that show them — the inspector tabs and the OSD chips.
 *
 * The engine indexes tiles as global ids (`spriteIndex + firstGid`); the
 * inspector deals in 0-based indices, and `_tilesetFirstGid` bridges the
 * two.
 */
export class SceneEditorView extends ResponsiveEditorView {
  declare _editor: SceneEditor
  declare _inspector: RightInspector

  private signals = new SignalScope()
  private _projectName = "Aria's Quest"
  private _sceneName = ''
  private _engine: Engine | null = null
  private _layers: LayerDescriptor[] = []
  private _tiles: TileDescriptor[] = []
  /** Placeable library objects — feeds the Tiles-tab grid + the context-chip popover. */
  private _objectBrushes: ObjectBrushOption[] = []
  /** The armed object brush (defId), mirrored from `win.set-object-brush`. */
  private _armedObjectId: string | null = null
  /** The active editor tool — decides what the context chip quick-selects (tiles vs objects). */
  private _activeTool: EditorTool = 'select'
  /** Per-placement info for the Props tab's "Selected object" group. */
  private _placementInfo = new Map<
    string,
    { name: string; defId: string | null; tileX: number; tileY: number; layerId: string }
  >()
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
          // show-library/-inspector + *-collapsed are inherited from
          // ResponsiveEditorView (all default false — both sidebars start
          // closed, opened on demand via the floating toggle pills).
          // Top-bar density (compact / show-back / show-history /
          // show-grid / show-chip-labels) is driven by an
          // `Adw.BreakpointBin` inside `scene-editor.blp` so it
          // tracks the canvas allocation rather than window width;
          // no passthrough properties needed here.
        },
        Signals: {
          // mode-changed is inherited from ResponsiveEditorView.
          // Fired when the active map's `MapData` was mutated in
          // place (e.g. user toggled a layer's visibility or lock
          // flag) and should be serialised back to disk. The host
          // listens because it tracks the project + scene paths
          // needed by `MapFormat.serialize` + `writeTextFile`.
          'persist-requested': { param_types: [] },
          // A placement was removed via the Props tab — the host
          // refreshes the inspector's placement list.
          'object-removed': { param_types: [] },
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

  /** Mirror the global objects visibility into the Layers tab's Objects row (no re-emit). */
  setObjectsVisible(visible: boolean): void {
    this._inspector.layersTab.setObjectsState(this._placementInfo.size, visible)
  }

  /**
   * Mirror an engine-side layer-flag change (the `LAYER_FLAG_CHANGED`
   * event — fired for local toggles, undo/redo AND inbound peer ops)
   * into this view's `_layers` cache + the Layers tab's eye/padlock
   * row state. The tab write is re-emit-free, so a mirrored change
   * never dispatches a second command. This is the single owner of
   * the cache update — the toggle handlers themselves don't write it
   * (anti-parallel-state: one mutating path).
   */
  setLayerFlag(layerId: string, flag: 'visible' | 'locked', value: boolean): void {
    const idx = this._layers.findIndex((l) => l.id === layerId)
    if (idx >= 0) this._layers[idx] = { ...this._layers[idx], [flag]: value }
    this._inspector.layersTab.setLayerState(layerId, flag, value)
  }

  /** Push the live participant roster (AI + peers) to the collaborators bar. */
  setCollaborators(participants: CollaboratorEntry[], followedId: string | null): void {
    this._editor.floatingCollaborators.setParticipants(participants, followedId)
  }

  /** Reflect the user pause state on the collaborators bar's AI control. */
  setAssistantPaused(paused: boolean): void {
    this._editor.floatingCollaborators.paused = paused
  }

  /** Subscribe to chip clicks — the host toggles follow for that participant. */
  onParticipantActivated(callback: (peerId: string) => void): void {
    this._editor.floatingCollaborators.connect('participant-activated', (_widget, peerId: string) => callback(peerId))
  }

  /**
   * On phone widths (`inspector-collapsed` is set only <768sp — tablet
   * collapses just the library), reflow the tool rail into a bottom bar.
   */
  protected _onInspectorCollapsedChanged(collapsed: boolean): void {
    this._editor.setCompact(collapsed)
  }

  /**
   * Forward the active editor tool to the left tool rail so its active
   * button highlights. The host calls this from the `win.set-tool`
   * action's change-state handler.
   *
   * The context chip is tool-dependent: under the Object tool its
   * quick-select popover offers the placeable OBJECTS (and the swatch
   * previews the armed brush); under every other tool it offers tiles —
   * so the chip always quick-selects what the current tool consumes.
   */
  setActiveTool(tool: EditorTool): void {
    this._editor.toolRail.setActiveTool(tool)
    if (this._activeTool === tool) return
    this._activeTool = tool
    this._refreshContextPopovers()
    this._syncContextChip()
  }

  /**
   * Mirror the armed object brush (from `win.set-object-brush`) into
   * the Tiles-tab grid highlight + the context chip (when the Object
   * tool is active). `null` clears.
   */
  setArmedObjectBrush(defId: string | null): void {
    if (this._armedObjectId === defId) return
    this._armedObjectId = defId
    this._inspector.tilesTab.selectObjectBrush(defId)
    if (this._activeTool === 'object') this._syncContextChip()
  }

  /**
   * Sync the right-inspector's objects-tab row highlight with a
   * canvas-driven selection (`PLACEMENT_SELECTED` event from the
   * engine's select tool). Passing `null` clears the row highlight —
   * matches what happens when the user clicks empty tile space with
   * the select tool active. The canvas-side selection ring lives on
   * the session-singleton's `SelectedPlacementsComponent`, mutated
   * inside `TileEditorSystem.applySelect`, so it doesn't need to be
   * re-applied here.
   */
  highlightPlacement(placementId: string | null): void {
    this._inspector.objectsTab.selectObject(placementId)
    this._syncSelectedObjectProps(placementId)
  }

  /** Push the selected placement into the Props tab's "Selected object" group (`null` hides it). */
  private _syncSelectedObjectProps(placementId: string | null): void {
    const info = placementId ? this._placementInfo.get(placementId) : null
    this._inspector.propsTab.setSelectedObject(info && placementId ? { placementId, ...info } : null)
  }

  /**
   * Switch the right inspector to a tab by name (`tiles` / `layers` /
   * `objects` / `props`). Drives the `win.set-inspector-tab` action so
   * tooling (the MCP bridge) can reach the Objects brush palette, the
   * Layers list, etc. — the tab bar is otherwise click-only.
   */
  setInspectorTab(name: string): void {
    this._inspector.visiblePage = name
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

    const layers = toLayerDescriptors(mapData)
    this._layers = layers
    this._inspector.layersTab.setLayers(layers)
    this._inspector.layersTab.setObjectsState(
      mapData.objectPlacements?.length ?? 0,
      this._engine?.excalibur?.getEditorViewFlags().objectsVisible ?? true,
    )
    if (layers.length) {
      this._inspector.layersTab.selectLayer(layers[0].id)
      this._setActiveLayer(layers[0].id)
    }

    await this._populateObjects(project, mapData)

    // Pick the first sprite set referenced by *this map* — that's the
    // one whose `firstGid` we need to offset against. Fall back to the
    // project-level list if the map doesn't pin a set.
    const mapSpriteSetRef = mapData.spriteSets?.[0]
    const firstSet = mapSpriteSetRef ?? project.resource.data?.spriteSets?.[0]
    if (firstSet) {
      await this.loadTileset(project, firstSet.id, mapSpriteSetRef?.firstGid ?? 1)
    }
  }

  /**
   * Fill the Objects tab (the map's placements) and the Tiles tab's
   * object-brush grid.
   *
   * Each placement resolves through the canonical resolver (inline, or
   * entity-library lookup by `defId`, with per-instance overrides merged);
   * falling back to the placement id keeps a row labelled even when the
   * library lookup misses.
   */
  private async _populateObjects(project: LoadedProject, mapData: MapData): Promise<void> {
    const library = project.resource.data?.entityLibrary ?? []
    const resolved = (mapData.objectPlacements ?? []).map((placement) => ({
      placement,
      def: resolvePlacementDefinition(placement, library),
    }))
    // The brush palette lists every library entity except the player
    // actor — it spawns at the player spawn-point, not via the brush.
    const playerId = project.resource.data?.playerActorId
    const brushDefs = library.filter((e) => e.id !== playerId)
    const sheets = await loadObjectSheets(
      project.resource,
      spriteSetIdsFor([...resolved.map((r) => r.def), ...brushDefs]),
    )

    this._inspector.objectsTab.setObjects(buildPlacementRows(resolved, sheets))
    this._placementInfo = new Map(
      resolved.map(({ placement, def }) => [
        placement.id,
        {
          name: def?.name ?? placement.id,
          defId: placement.defId ?? null,
          tileX: placement.tileX,
          tileY: placement.tileY,
          layerId: placement.layerId,
        },
      ]),
    )

    const brushOptions = buildBrushOptions(brushDefs, sheets)
    this._objectBrushes = brushOptions
    this._inspector.tilesTab.setObjectBrushes(brushOptions)
    if (this._armedObjectId && !brushOptions.some((b) => b.id === this._armedObjectId)) this._armedObjectId = null
    this._inspector.tilesTab.selectObjectBrush(this._armedObjectId)
  }

  /** The sprite-set id currently feeding the Tiles-tab palette. */
  get activeTilesetId(): string {
    return this._tilesetName
  }

  /**
   * Load `spriteSetId` into the Tiles-tab palette as the active painting
   * tileset, offsetting tile ids by `firstGid`. Extracted from
   * {@link populateFromProject} so the "Switch…" tileset action can
   * re-point the palette to another of the map's tilesets (the win
   * action resolves the set + firstGid from the map's `spriteSets`).
   */
  async loadTileset(project: LoadedProject, spriteSetId: string, firstGid: number): Promise<void> {
    try {
      const engineSet = await project.resource.getSpriteSet(spriteSetId)
      if (!engineSet) return
      const gdkSet = await GdkSpriteSetResource.fromEngineResource(engineSet)
      if (!gdkSet.spriteSheet) return
      this._inspector.tilesTab.tilesetName = spriteSetId
      this._tilesetName = spriteSetId
      this._tilesetFirstGid = firstGid
      const tiles = this._sheetToTiles(gdkSet.spriteSheet)
      this._tiles = tiles
      this._inspector.tilesTab.setTiles(tiles)
      if (tiles.length) this._setActiveTile(tiles[0].id)
      // After the active tile, not before: the popovers read it back off
      // the engine, and `_tilesetFirstGid` has already moved to the new
      // sheet, so building first would resolve the previous sheet's index.
      this._refreshContextPopovers()
    } catch (error) {
      console.warn('[SceneEditorView] Failed to load sprite set for tiles tab:', error)
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
  private _setActiveTile(tileId: number): void {
    // Engine write first: the chip below reads the value back, and this is
    // the only place it is stored.
    //
    // Never short-circuit on the current value. `ActiveTileComponent` is
    // per-scene, so on a map switch (or re-entry after
    // `EngineController.dispose`) the new scene's session state starts
    // empty and the replay has to reach it, or the engine has no active
    // tile until the user picks a swatch by hand.
    this._engine?.setActiveTile(tileId + this._tilesetFirstGid)
    // The chip mirrors what the current tool consumes — under the Object
    // tool it keeps showing the armed object; tile state still updates.
    this._syncContextChip()
    // Mirror selection back to the inspector palette in case the change
    // came from the top-bar tile popover.
    this._inspector.tilesTab.selectTile(tileId)
  }

  /**
   * The active tile as a **local** sheet index, resolved from the engine's
   * per-scene `ActiveTileComponent` (which stores the global id). `null`
   * when no engine is up or the scene has no active tile — the same
   * condition under which {@link _setActiveTile}'s write is dropped, so
   * the two never disagree.
   */
  private get _activeTileIndex(): number | null {
    const globalTileId = this._engine?.excalibur?.getActiveTile()
    return globalTileId == null ? null : globalTileId - this._tilesetFirstGid
  }

  /** The active layer id, read straight off `ActiveLayerComponent`. */
  private get _activeLayerId(): string | null {
    return this._engine?.excalibur?.getActiveLayer() ?? null
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
    this._setActiveTile(localId)
    return true
  }

  private _setActiveLayer(layerId: string): void {
    // No short-circuit on the current value — same reasoning as
    // `_setActiveTile`: `ActiveLayerComponent` resets on every map load,
    // so the populate-from-project replay must always reach the engine.
    this._engine?.setActiveLayer(layerId)
    const layer = this._layers.find((l) => l.id === layerId)
    this._editor.topBar.layerName = layer?.name ?? layerId
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
   * The brush popover is tool-dependent: the Object tool quick-selects
   * objects, every other tool quick-selects tiles.
   */
  private _refreshContextPopovers(): void {
    this._editor.topBar.setTilePopover(
      this._activeTool === 'object'
        ? buildObjectPopover({ brushes: this._objectBrushes, armedId: this._armedObjectId }, (defId) =>
            this.activate_action('win.set-object-brush', GLib.Variant.new_string(defId)),
          )
        : buildTilePopover(
            { tilesetName: this._tilesetName, tiles: this._tiles, activeIndex: this._activeTileIndex },
            (tileId) => this._setActiveTile(tileId),
          ),
    )
    this._editor.topBar.setLayerPopover(
      buildLayerPopover({ layers: this._layers, activeId: this._activeLayerId }, (layerId) =>
        this._setActiveLayer(layerId),
      ),
    )
  }

  /**
   * Sync the context chip's label + swatch with what the current tool
   * consumes: the armed object brush under the Object tool, the active
   * tile otherwise.
   */
  private _syncContextChip(): void {
    if (this._activeTool === 'object') {
      const armed = this._objectBrushes.find((b) => b.id === this._armedObjectId) ?? null
      this._editor.topBar.tileName = armed?.name ?? 'Object'
      this._editor.topBar.setTilePaintable(armed?.paintable ?? null)
      return
    }
    const index = this._activeTileIndex
    const tile = index != null ? this._tiles.find((t) => t.id === index) : null
    this._editor.topBar.tileName = tile?.name ?? (index != null ? `Tile ${index}` : 'Tile')
    this._editor.topBar.setTilePaintable(tile?.paintable ?? null)
  }

  private _wireInspectorSignals(): void {
    wireTilesTab(this._inspector.tilesTab, {
      isObjectToolActive: () => this._activeTool === 'object',
      armPencilTool: () => this.activate_action('win.set-tool', GLib.Variant.new_string('pencil')),
      setActiveTile: (tileId) => this._setActiveTile(tileId),
      armObjectBrush: (defId) => this.activate_action('win.set-object-brush', GLib.Variant.new_string(defId)),
    })
    wireLayersTab(this._inspector.layersTab, {
      setActiveLayer: (layerId) => this._setActiveLayer(layerId),
      setLayerVisible: (layerId, visible) => this._engine?.setLayerVisible(layerId, visible),
      setLayerLocked: (layerId, locked) => this._engine?.setLayerLocked(layerId, locked),
      persistMapData: () => this._persistMapData(),
      toggleObjectsVisibility: () => this.activate_action('win.toggle-objects', null),
    })
    wireObjectsTab(this._inspector.objectsTab, {
      selectPlacement: (placementId) => {
        this._engine?.setSelectedPlacements([placementId])
        this._syncSelectedObjectProps(placementId)
        // Fire-and-forget: the engine resolves the pan when the camera
        // move ends, or rejects when a second pick supersedes it.
        void this._engine?.focusOnPlacement(placementId)
      },
    })
    wirePropsTab(this._inspector.propsTab, {
      openObjectDefinition: (defId) => this.activate_action('win.open-object', GLib.Variant.new_string(defId)),
      removePlacement: (placementId) => {
        if (!this._engine?.excalibur?.removeObject(placementId)) return
        this._syncSelectedObjectProps(null)
        this._inspector.objectsTab.selectObject(null)
        this.emit('object-removed')
      },
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

  get sceneName(): string {
    return this._sceneName ?? ''
  }

  set sceneName(value: string) {
    if (this._sceneName === value) return
    this._sceneName = value
    this.notify('scene-name')
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
