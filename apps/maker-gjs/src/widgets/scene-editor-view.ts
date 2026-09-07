import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import { gettext as _ } from 'gettext'
import type Gtk from '@girs/gtk-4.0'
import type Gdk from '@girs/gdk-4.0'
import { type EditorTool, type LayerPlane, type MapData, resolvePlacementDefinition } from '@pixelrpg/engine'
import {
  type CollaboratorEntry,
  type EditorMode,
  type Engine,
  GdkSpriteSetResource,
  type GdkSpriteSheet,
  type LayerDescriptor,
  planeOf,
  populatedPlanes,
  pushRecent,
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
import { paintableFor } from './scene-editor/object-descriptors.ts'
import { wireLayersTab, wireObjectsTab, wirePropsTab, wireTilesTab } from './scene-editor/inspector-wiring.ts'
import {
  buildBrushOptions,
  buildPlacementRows,
  loadObjectSheets,
  type ObjectBrushOption,
  spriteSetIdsFor,
} from './scene-editor/object-descriptors.ts'

/**
 * The tool's verb, for the sentence beside the badge ("Paint · Ground").
 * The tool chooser owns the same words for its tooltips and its roomy
 * labels; this table is the maker's copy for the one place the label is
 * assembled with the layer name.
 */
const TOOL_LABELS: Record<EditorTool, string> = {
  select: _('Select'),
  pencil: _('Paint'),
  fill: _('Fill'),
  eraser: _('Erase'),
  eyedropper: _('Pick'),
  object: _('Object'),
}

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
  /** The project's player sprite, drawn in every depth glyph (`null` = silhouette). */
  private _heroPaintable: Gdk.Paintable | null = null
  private _tiles: TileDescriptor[] = []
  /** Placeable library objects — feeds the Tiles-tab grid + the context-chip popover. */
  private _objectBrushes: ObjectBrushOption[] = []
  /** The armed object brush (defId), mirrored from `win.set-object-brush`. */
  private _armedObjectId: string | null = null
  /** The active editor tool — decides what the badge shows (tile vs object). */
  private _activeTool: EditorTool = 'select'
  /** The active layer's name, for the sentence beside the badge. */
  private _activeLayerName = ''
  /**
   * The layer a plane chip returns to. A person who moves Above → Below
   * → Above expects their roof layer back, not the plane's first one.
   */
  private _lastLayerByPlane = new Map<LayerPlane, string>()
  /** Session-local LRU of sheet-local tile ids behind the phone bar's strip. */
  private _recentTileIds: number[] = []
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
    this._wireInspectorSignals()
    this._wireEditorSignals()
  }

  /**
   * The chrome's own picks. `wireTilesTab`'s rule applies verbatim here:
   * choosing a tile while the Object tool is armed means "paint this",
   * so it arms the pencil first.
   */
  private _wireEditorSignals(): void {
    const page = this._editor.brushPage
    page.connect('tile-selected', (_p: unknown, tileId: number) => {
      if (this._activeTool === 'object') this.activate_action('win.set-tool', GLib.Variant.new_string('pencil'))
      this._setActiveTile(tileId)
    })
    page.connect('object-brush-selected', (_p: unknown, defId: string) =>
      this.activate_action('win.set-object-brush', GLib.Variant.new_string(defId)),
    )
    page.connect('plane-selected', (_p: unknown, plane: string) => this._selectPlane(plane as LayerPlane))
    page.connect('layers-requested', () => {
      this.activate_action('win.set-inspector-tab', GLib.Variant.new_string('layers'))
      this.showInspector = true
    })
    this._editor.recentTiles.connect('tile-selected', (_r: unknown, tileId: number) => {
      if (this._activeTool === 'object' || this._activeTool === 'select') {
        this.activate_action('win.set-tool', GLib.Variant.new_string('pencil'))
      }
      this._setActiveTile(tileId)
    })
  }

  /** Show the current zoom in the transient bottom-centre readout. */
  setZoom(zoom: number): void {
    this._editor.setZoom(zoom)
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

  /**
   * Reflect the `win.play` action's runtime state on the whole chrome,
   * not just the FAB: on phone the bar and the FAB give way to the run
   * and the context pill becomes Stop · Restart, because during a Live
   * Run the finger is the joystick rather than a brush.
   */
  setPlaying(playing: boolean): void {
    this._editor.setPlaying(playing)
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

  /** Push the live participant roster (AI + peers) to the context pill's chip. */
  setCollaborators(participants: CollaboratorEntry[], followedId: string | null): void {
    this._editor.rosterChip.setParticipants(participants, followedId)
  }

  /** Reflect the user pause state on the roster chip's AI control. */
  setAssistantPaused(paused: boolean): void {
    this._editor.rosterChip.paused = paused
  }

  /** Subscribe to roster clicks — the host toggles follow for that participant. */
  onParticipantActivated(callback: (peerId: string) => void): void {
    this._editor.rosterChip.connect('participant-activated', (_widget, peerId: string) => callback(peerId))
  }

  /**
   * `inspector-collapsed` is set only <768sp — the tablet breakpoint
   * collapses just the library — so it is the phone signal. The editor's
   * whole chrome switch hangs off it.
   */
  protected _onInspectorCollapsedChanged(collapsed: boolean): void {
    this._editor.setLayout(collapsed ? 'phone' : 'wide')
  }

  /** Push the tier down so the caption, the Play menu and "⋯" follow it. */
  protected _onFullViewChanged(fullView: boolean): void {
    this._editor.fullView = fullView
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
    this._editor.toolGroup.setActiveTool(tool)
    if (this._activeTool === tool) return
    this._activeTool = tool
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
    this._editor.brushPage.selectObjectBrush(defId)
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
    this._editor.setZoom(1)
    // The caption stays empty until the first pointer-move arrives over
    // the canvas — see `setCursorTile`. Writing `0, 0` here would stick
    // a misleading readout on it before the user has moved the mouse.
    this._editor.setCursorTile(null, null)
  }

  /**
   * Push the tile under the pointer to the floating-zoom OSD's coord
   * label. Pass `null, null` to clear the readout (pointer left the
   * canvas / map switched). The OSD widget itself dedupes consecutive
   * identical values — this is just the forwarder.
   */
  setCursorTile(tileX: number | null, tileY: number | null): void {
    this._editor.setCursorTile(tileX, tileY)
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
    const playerDef = library.find((e) => e.id === playerId) ?? null
    const sheets = await loadObjectSheets(
      project.resource,
      spriteSetIdsFor([...resolved.map((r) => r.def), ...brushDefs, playerDef]),
    )
    // The depth glyphs draw the project's own hero, so "above the hero"
    // is above THIS hero; a project without a player gets the silhouette.
    this._heroPaintable = paintableFor(playerDef, sheets)
    this._inspector.layersTab.heroPaintable = this._heroPaintable
    this._editor.brushPage.heroPaintable = this._heroPaintable

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
    this._editor.brushPage.setObjectBrushes(brushOptions)
    if (this._armedObjectId && !brushOptions.some((b) => b.id === this._armedObjectId)) this._armedObjectId = null
    this._inspector.tilesTab.selectObjectBrush(this._armedObjectId)
    this._editor.brushPage.selectObjectBrush(this._armedObjectId)
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
      this._editor.brushPage.setTiles(tiles)
      // A fresh sheet starts the recency list over: ids are sheet-local,
      // so carrying the old ones across would ring the wrong swatches.
      this._recentTileIds = tiles.slice(0, 8).map((tile) => tile.id)
      this._refreshRecentTiles()
      if (tiles.length) this._setActiveTile(tiles[0].id)
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
    // The badge mirrors what the current tool consumes — under the Object
    // tool it keeps showing the armed object; tile state still updates.
    this._syncContextChip()
    // Mirror selection back into every surface that shows it, wherever
    // the change came from: the inspector palette, the brush page, and
    // the phone bar's recent strip.
    this._inspector.tilesTab.selectTile(tileId)
    this._editor.brushPage.selectTile(tileId)
    this._recentTileIds = pushRecent(this._recentTileIds, tileId)
    this._refreshRecentTiles()
  }

  /** Re-render the phone bar's recency strip from the current id list. */
  private _refreshRecentTiles(): void {
    const byId = new Map(this._tiles.map((tile) => [tile.id, tile]))
    const tiles = this._recentTileIds
      .map((id) => byId.get(id))
      .filter((tile): tile is TileDescriptor => tile !== undefined)
    this._editor.recentTiles.setTiles(tiles)
    this._editor.recentTiles.setActive(this._activeTileIndex)
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

  /** The active layer id, for hosts that create relative to it (a new layer lands in its plane). */
  get activeLayerId(): string | null {
    return this._activeLayerId
  }

  /** Make `layerId` the active layer — engine, top-bar chip and Layers tab together. */
  selectLayer(layerId: string): void {
    this._setActiveLayer(layerId)
  }

  /**
   * Re-read the map's layer list into the Layers tab + popover after a
   * `LAYER_LIST_CHANGED` (add / reorder / change of plane on ANY path —
   * local drop, undo, redo, a peer's op). Keeps the active layer; the
   * caller passes the live `mapData`, which is the single owner of the
   * order, so the tab never holds an order of its own.
   */
  refreshLayers(mapData: MapData): void {
    this._layers = toLayerDescriptors(mapData)
    this._inspector.layersTab.setLayers(this._layers)
    const activeId = this._activeLayerId
    if (activeId) {
      this._inspector.layersTab.selectLayer(activeId)
      const layer = this._layers.find((l) => l.id === activeId)
      if (layer) this._applyActiveLayer(layer.id, layer)
    }
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
    this._applyActiveLayer(layerId, layer)
    // Mirror selection back to the inspector layers tab.
    this._inspector.layersTab.selectLayer(layerId)
  }

  /**
   * Push the active layer into every surface that shows it: the badge's
   * ring colour, the sentence beside it, the brush page's caption and
   * its plane chips. One writer, so the ring and the caption can never
   * disagree about which plane the next stroke lands on.
   */
  private _applyActiveLayer(layerId: string, layer: LayerDescriptor | undefined): void {
    const plane = layer ? planeOf(layer) : 'ground'
    this._activeLayerName = layer?.name ?? layerId
    this._editor.brushBadge.plane = plane
    this._editor.brushPage.layerName = this._activeLayerName
    this._editor.brushPage.setActivePlane(plane, populatedPlanes(this._layers))
    this._lastLayerByPlane.set(plane, layerId)
    this._syncBrushLabel()
  }

  /** "Paint · Ground" — what, and where it lands. */
  private _syncBrushLabel(): void {
    this._editor.brushLabel = `${TOOL_LABELS[this._activeTool] ?? this._activeTool} · ${this._activeLayerName}`
  }

  /**
   * A plane chip was tapped: activate that plane's last-used layer, or
   * its topmost one when this session has not been there yet. The chip
   * is insensitive for a plane with no layers, so there is always one to
   * land on.
   */
  private _selectPlane(plane: LayerPlane): void {
    const remembered = this._lastLayerByPlane.get(plane)
    if (remembered && this._layers.some((l) => l.id === remembered)) {
      this._setActiveLayer(remembered)
      return
    }
    const fallback = [...this._layers].reverse().find((l) => planeOf(l) === plane)
    if (fallback) this._setActiveLayer(fallback.id)
  }

  /**
   * A row dropped in the Layers tab: same plane → a reorder, another
   * plane → a change of plane (which carries the position too). Both
   * are registered commands, so undo and peers follow; the resulting
   * `LAYER_LIST_CHANGED` re-reads the list into the tab.
   */
  private _moveLayer(layerId: string, plane: LayerPlane, index: number): void {
    const layer = this._layers.find((l) => l.id === layerId)
    if (!layer) return
    if (planeOf(layer) === plane) this._engine?.reorderLayer(layerId, index)
    else this._engine?.setLayerPlane(layerId, plane, index)
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
   * Sync the brush badge with what the current tool consumes: the armed
   * object brush under the Object tool, the active tile otherwise.
   *
   * The badge draws the tool itself (corner disc) and the plane (ring),
   * so this only supplies the picture; `_applyActiveLayer` supplies the
   * ring and `setActiveTool` the disc. The three chips this replaced —
   * a rail row, a tile chip and a layer chip — are now one square.
   */
  private _syncContextChip(): void {
    this._editor.brushBadge.tool = this._activeTool
    this._syncBrushLabel()
    if (this._activeTool === 'object') {
      const armed = this._objectBrushes.find((b) => b.id === this._armedObjectId) ?? null
      this._editor.brushBadge.tilePaintable = armed?.paintable ?? null
      return
    }
    const index = this._activeTileIndex
    const tile = index != null ? this._tiles.find((t) => t.id === index) : null
    this._editor.brushBadge.tilePaintable = tile?.paintable ?? null
    this._editor.recentTiles.setActive(index)
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
      moveLayer: (layerId, plane, index) => this._moveLayer(layerId, plane, index),
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
