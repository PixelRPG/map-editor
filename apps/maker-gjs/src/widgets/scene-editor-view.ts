import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import {
  BUILT_IN_COMPONENT_SPECS,
  type EditorTool,
  type EntityDefinition,
  getComponentData,
  markerColorFor,
} from '@pixelrpg/engine'
import {
  type EditorMode,
  type Engine,
  type CollaboratorEntry,
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
import { ResponsiveEditorView } from './responsive-editor-view.ts'

/** The sprite reference of a definition's `visual` component, if any. */
function visualOf(def: EntityDefinition | null): { spriteSetId: string; spriteId: number } | null {
  const v = def ? getComponentData(def, 'visual') : undefined
  if (v && typeof v.spriteSetId === 'string') {
    return { spriteSetId: v.spriteSetId, spriteId: typeof v.spriteId === 'number' ? v.spriteId : 0 }
  }
  return null
}

/**
 * Priority order for the Objects-tab row icon when a placement has no
 * sprite — the dominant component's editor icon wins (mirrors the spawn
 * marker priority). Returns `undefined` so the tab uses its fallback.
 */
const OBJECT_ICON_PRIORITY = ['teleport', 'item', 'spawn-point', 'npc-route', 'dialogue', 'trigger']
function iconOf(def: EntityDefinition | null): string | undefined {
  if (!def) return undefined
  const types = new Set(def.components.map((c) => c.type))
  for (const t of OBJECT_ICON_PRIORITY) {
    if (types.has(t)) return BUILT_IN_COMPONENT_SPECS[t]?.editor.icon
  }
  return undefined
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
 * Owns the tile / layer state synced between three surfaces:
 *
 * 1. The inspector tabs (sidebar)
 * 2. The OSD {@link FloatingTopBar} popovers (tile + layer chips)
 * 3. The engine via `Engine.setEditorState({ tileId, layerId })`
 *
 * `tileId` is sent to the engine as a global tile id
 * (`spriteIndex + firstGid`); the inspector deals in 0-based indices.
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
  private _activeTileId: number | null = null
  /** Placeable library objects (id/name/paintable/colour) — feeds the Tiles-tab grid + the context-chip popover. */
  private _objectBrushes: Array<{ id: string; name: string; paintable: Gdk.Paintable | null; color?: string }> = []
  /** The armed object brush (defId), mirrored from `win.set-object-brush`. */
  private _armedObjectId: string | null = null
  /** The active editor tool — decides what the context chip quick-selects (tiles vs objects). */
  private _activeTool: EditorTool = 'select'
  /** Per-placement info for the Props tab's "Selected object" group. */
  private _placementInfo = new Map<
    string,
    { name: string; defId: string | null; tileX: number; tileY: number; layerId: string }
  >()
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
   * Forward the active editor tool to the top bar so its tool
   * MenuButton's icon mirrors the selection. The host calls this
   * from the `win.set-tool` action's change-state handler.
   *
   * The context chip is tool-dependent: under the Object tool its
   * quick-select popover offers the placeable OBJECTS (and the swatch
   * previews the armed brush); under every other tool it offers tiles —
   * so the chip always quick-selects what the current tool consumes.
   */
  setActiveTool(tool: EditorTool): void {
    this._editor.topBar.setActiveTool(tool)
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
    const library = project.resource.data?.entityLibrary ?? []
    const resolvedDefs = (mapData.objectPlacements ?? []).map((p) => ({
      placement: p,
      def: p.inline ?? library.find((d) => d.id === p.defId) ?? null,
    }))
    // The placement-brush palette lists every library entity except the
    // player actor (it spawns at the player spawn-point, not via the brush).
    const playerId = project.resource.data?.playerActorId
    const brushDefs = library.filter((e) => e.id !== playerId)
    // Collect the sprite-sets used by BOTH placed objects and brush
    // candidates so each gets a real sprite thumbnail (deduped load).
    const objectSpriteSetIds = new Set<string>()
    for (const { def } of resolvedDefs) {
      const vis = visualOf(def)
      if (vis) objectSpriteSetIds.add(vis.spriteSetId)
    }
    for (const def of brushDefs) {
      const vis = visualOf(def)
      if (vis) objectSpriteSetIds.add(vis.spriteSetId)
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
      const vis = visualOf(def)
      if (vis) {
        const sheet = gdkSheets.get(vis.spriteSetId)
        const sprite = sheet?.sprites[vis.spriteId]
        paintable = sprite?.createPaintable() ?? null
      }
      return {
        id: placement.id,
        name: def?.name ?? placement.id,
        icon: iconOf(def),
        tileX: placement.tileX,
        tileY: placement.tileY,
        layerId: placement.layerId,
        paintable,
        // No resolvable sprite → the def's marker colour, mirroring the
        // type-coloured marker the placement shows on the map.
        color: paintable ? undefined : def ? markerColorFor(def.components) : undefined,
      }
    })
    this._inspector.objectsTab.setObjects(placements)
    this._placementInfo = new Map(
      resolvedDefs.map(({ placement, def }) => [
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
    // Feed the Tiles tab's Objects grid every brush candidate WITH a
    // sprite thumbnail (its `visual` component resolved against the
    // loaded sheets) or its marker colour as the fallback swatch, so
    // picking an object looks + feels exactly like picking a tile.
    // Characters (Cast NPCs) are placeable too; the player is excluded
    // above.
    const brushOptions = brushDefs.map((def) => {
      let paintable = null
      const vis = visualOf(def)
      if (vis) paintable = gdkSheets.get(vis.spriteSetId)?.sprites[vis.spriteId]?.createPaintable() ?? null
      return { id: def.id, name: def.name, paintable, color: paintable ? undefined : markerColorFor(def.components) }
    })
    this._objectBrushes = brushOptions
    this._inspector.tilesTab.setObjectBrushes(brushOptions)
    if (this._armedObjectId && !brushOptions.some((b) => b.id === this._armedObjectId)) this._armedObjectId = null
    this._inspector.tilesTab.selectObjectBrush(this._armedObjectId)

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
            if (tiles.length) this._setActiveTile(tiles[0].id)
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
  private _setActiveTile(tileId: number): void {
    // Do NOT short-circuit on `_activeTileId === tileId`. The engine's
    // `ActiveTileComponent` is per-scene; on map switch (or re-entry
    // after `EngineController.dispose`) the new scene's session state
    // starts empty even though `_activeTileId` still holds the previous
    // scene's value. A short-circuit there would leave the engine
    // without an active tile until the user manually picked a swatch
    // — the same shape of bug the startup-order fix addresses.
    this._activeTileId = tileId
    // The chip mirrors what the current tool consumes — under the Object
    // tool it keeps showing the armed object; tile state still updates.
    this._syncContextChip()
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
    this._setActiveTile(localId)
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
   * The brush popover is tool-dependent: the Object tool quick-selects
   * objects, every other tool quick-selects tiles.
   */
  private _refreshContextPopovers(): void {
    this._editor.topBar.setTilePopover(
      this._activeTool === 'object' ? this._buildObjectPopover() : this._buildTilePopover(),
    )
    this._editor.topBar.setLayerPopover(this._buildLayerPopover())
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
    const tile = this._activeTileId != null ? this._tiles.find((t) => t.id === this._activeTileId) : null
    this._editor.topBar.tileName = tile?.name ?? (this._activeTileId != null ? `Tile ${this._activeTileId}` : 'Tile')
    this._editor.topBar.setTilePaintable(tile?.paintable ?? null)
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
      this._setActiveTile(id)
    })
    scrolled.set_child(palette)
    box.append(scrolled)

    popover.set_child(box)
    return popover
  }

  /**
   * The Object tool's counterpart to {@link _buildTilePopover}: the same
   * palette grid fed with the placeable library objects (shared swatch
   * rendering — sprite or marker colour, framed). Picking one arms the
   * brush via `win.set-object-brush`.
   */
  private _buildObjectPopover(): Gtk.Popover {
    const popover = new Gtk.Popover()
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 8,
      margin_top: 8,
      margin_bottom: 8,
      margin_start: 8,
      margin_end: 8,
    })

    const heading = new Gtk.Label({ label: 'Objects', halign: Gtk.Align.START })
    heading.add_css_class('caption-heading')
    heading.add_css_class('dim-label')
    box.append(heading)

    if (this._objectBrushes.length === 0) {
      const empty = new Gtk.Label({ label: 'No objects in the library yet' })
      empty.add_css_class('dim-label')
      box.append(empty)
      popover.set_child(box)
      return popover
    }

    const scrolled = new Gtk.ScrolledWindow({
      hscrollbar_policy: Gtk.PolicyType.NEVER,
      vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
      min_content_height: 240,
      min_content_width: 280,
    })
    const palette = new TilePalette({ tileSize: 32, columns: 6 })
    palette.aspectMode = 'contain'
    palette.add_css_class('object-brush-palette')
    palette.setTiles(
      this._objectBrushes.map((b, idx) => ({
        id: idx,
        name: b.name,
        color: b.color,
        paintable: b.paintable ?? undefined,
      })),
    )
    const armedIdx = this._armedObjectId ? this._objectBrushes.findIndex((b) => b.id === this._armedObjectId) : -1
    if (armedIdx >= 0) palette.selectTile(armedIdx)
    palette.connect('tile-selected', (_p, idx: number) => {
      const brush = this._objectBrushes[idx]
      if (brush) this.activate_action('win.set-object-brush', GLib.Variant.new_string(brush.id))
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
      // Picking a tile while the Object tool is armed means "paint this
      // tile" — switch back to the pencil, the mirror of an object pick
      // arming the Object tool.
      if (this._activeTool === 'object') {
        this.activate_action('win.set-tool', GLib.Variant.new_string('pencil'))
      }
      this._setActiveTile(tileId)
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
      this._syncSelectedObjectProps(placementId)
      // Smoothly pan the canvas to the picked object. Fire-and-forget —
      // we don't care about the promise here, the engine resolves it
      // when the camera move ends (or rejects on an interrupted move,
      // e.g. the user picked a second object before the first pan
      // finished — also fine, the new pan supersedes).
      void this._engine?.focusOnPlacement(placementId)
    })
    // Selected-object actions from the Props tab. Open routes through
    // the existing `win.open-object` navigation; remove dispatches the
    // undoable RemoveObjectCommand and asks the host to refresh the
    // placement list.
    const props = this._inspector.propsTab
    props.connect('object-open-requested', (_p: typeof props, defId: string) => {
      this.activate_action('win.open-object', GLib.Variant.new_string(defId))
    })
    props.connect('object-remove-requested', (_p: typeof props, placementId: string) => {
      if (!this._engine?.excalibur?.removeObject(placementId)) return
      this._syncSelectedObjectProps(null)
      this._inspector.objectsTab.selectObject(null)
      this.emit('object-removed')
    })

    // Object brush picked in the Tiles tab's Objects grid → arm it +
    // switch to the Object tool via the window action (it sets both the
    // engine brush and the tool state) — picking what to place activates
    // placement mode in one step, just like picking a tile arms the
    // pencil's active tile.
    tiles.connect('object-brush-selected', (_t: TilesTab, defId: string) => {
      this.activate_action('win.set-object-brush', GLib.Variant.new_string(defId))
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
