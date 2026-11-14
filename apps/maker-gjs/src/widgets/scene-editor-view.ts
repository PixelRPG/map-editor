import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import { gettext as _ } from 'gettext'
import type Gtk from '@girs/gtk-4.0'
import type Gdk from '@girs/gdk-4.0'
import {
  basePlacementDefinition,
  type EditorTool,
  effectiveComponentRegistry,
  type EntityDefinition,
  type LayerPlane,
  type MapData,
  placementOverridesFrom,
  resolvePlacementDefinition,
} from '@pixelrpg/engine'
import {
  type CollaboratorEntry,
  EditorPages,
  type Engine,
  GdkSpriteSetResource,
  type GdkSpriteSheet,
  type LayerDescriptor,
  planeOf,
  populatedPlanes,
  pushRecent,
  RightInspector,
  type SampleScene,
  SceneEditor,
  type SelectedPlacementDescriptor,
  sheetGridOf,
  type TileDescriptor,
  type TilesetChipDescriptor,
} from '@pixelrpg/gjs'
import { toLayerDescriptors } from '../services/layer-descriptors.ts'
import type { LoadedProject } from '../services/project-loader.ts'
import { ResponsiveEditorView, type ResponsiveEditorViewSignals } from './responsive-editor-view.ts'
import Template from './scene-editor-view.blp'
import { paintableFor } from './scene-editor/object-descriptors.ts'
import { wireBrushPage, wireLayersPage, wireSelectedPage } from './scene-editor/inspector-wiring.ts'
import {
  buildBrushOptions,
  loadObjectSheets,
  type ObjectBrushOption,
  type ObjectSheets,
  spriteSetIdsFor,
} from './scene-editor/object-descriptors.ts'
import { buildRefOptions } from '../services/project-store-entities.ts'

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
  object: _('Thing'),
}

/**
 * Longer edge of a tileset chip's sheet thumbnail, in px. The chip box is
 * 56×40, so a 96-px texture survives HiDPI scaling without carrying a
 * whole 1024-px sheet per chip.
 */
const TILESET_CHIP_THUMB_PX = 96

GObject.type_ensure(SceneEditor.$gtype)
GObject.type_ensure(RightInspector.$gtype)

/**
 * Typed view of the signals {@link SceneEditorView} registers, layered on the parent's
 * own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface SceneEditorViewSignals extends ResponsiveEditorViewSignals {
  'persist-requested': () => void
  'object-removed': () => void
}

/**
 * Maker-app **Scene Editor** view.
 *
 * One `Adw.OverlaySplitView` with the {@link SceneEditor} content on the
 * left and the {@link RightInspector} on the right. No shell navigation:
 * the map editor is its own `root_stack` page, reached from a map card
 * and left through the back affordance (REDESIGN.md § 3.4).
 *
 * This view OWNS the three pages (Brush · Layers · Selected) as a single
 * {@link EditorPages} set and hosts them in whichever container the
 * layout calls for — the inspector when wide, the bottom sheet on phone
 * (REDESIGN.md § 5.2). Every populate call therefore has exactly one
 * target, whatever the window width.
 *
 * The active tile and layer live ONLY on the engine's session singleton
 * (`ActiveTileComponent` / `ActiveLayerComponent`); this view holds no
 * copy. It writes them through {@link _setActiveTile} /
 * {@link _setActiveLayer} and reads them back through
 * {@link _activeTileIndex} / {@link _activeLayerId} to re-render the two
 * surfaces that show them — the pages and the OSD chips.
 *
 * The engine indexes tiles as global ids (`spriteIndex + firstGid`); the
 * inspector deals in 0-based indices, and `_tilesetFirstGid` bridges the
 * two.
 */
export class SceneEditorView extends ResponsiveEditorView {
  declare _editor: SceneEditor
  declare _inspector: RightInspector

  /** The three pages, hosted by the inspector or the sheet — never both. */
  private _pages = new EditorPages()
  private _sceneName = ''
  private _engine: Engine | null = null
  private _layers: LayerDescriptor[] = []
  /** The project's player sprite, drawn in every depth glyph (`null` = silhouette). */
  private _heroPaintable: Gdk.Paintable | null = null
  private _tiles: TileDescriptor[] = []
  /** Placeable library objects — feeds the Brush-page grid + the context-chip popover. */
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
  /**
   * The LIVE `MapData` of the open map — the very object the engine
   * mutates in place (see {@link _persistMapData}), not a snapshot. The
   * Selected page is built from it on demand, so a placement the user
   * just duplicated, moved or edited is described correctly without a
   * re-populate. A snapshot is what used to clear the page after a Copy:
   * the copy's id wasn't in it yet.
   */
  private _mapData: MapData | null = null
  /** The project's entity library, for resolving a placement to its definition. */
  private _entityLibrary: readonly EntityDefinition[] = []
  /** Sprite sheets behind the placement sprites, keyed by sprite-set id. */
  private _objectSheets: ObjectSheets = new Map()
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
        InternalChildren: ['editor', 'inspector'],
        Properties: {
          'scene-name': GObject.ParamSpec.string(
            'scene-name',
            'Scene Name',
            'Title of the scene currently shown in the editor',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          // show-inspector + inspector-collapsed are inherited from
          // ResponsiveEditorView (both default false — the inspector
          // starts closed, opened on demand via the floating toggle
          // pill). `compact` is deliberately NOT set for this view: the
          // map editor carries no shell navigation, so there would be
          // nothing to move to a bottom bar.
          // Top-bar density (compact / show-back / show-history /
          // show-grid / show-chip-labels) is driven by an
          // `Adw.BreakpointBin` inside `scene-editor.blp` so it
          // tracks the canvas allocation rather than window width;
          // no passthrough properties needed here.
        },
        Signals: {
          // Fired when the active map's `MapData` was mutated in
          // place (e.g. user toggled a layer's visibility or lock
          // flag) and should be serialised back to disk. The host
          // listens because it tracks the project + scene paths
          // needed by `MapFormat.serialize` + `writeTextFile`.
          'persist-requested': { param_types: [] },
          // A placement was removed via the Selected page — the host
          // refreshes the inspector's placement list.
          'object-removed': { param_types: [] },
        },
      },
      SceneEditorView,
    )
  }

  declare connect: GObject.SignalMethods<this, SceneEditorViewSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, SceneEditorViewSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, SceneEditorViewSignals>['emit']

  constructor() {
    super()
    // `inspector-collapsed` only notifies on a CHANGE, so the initial
    // layout has to be hosted by hand — otherwise the pages stay
    // unparented until the first breakpoint crossing.
    this._pages.host(this.inspectorCollapsed ? this._editor.pageSlots : this._inspector.pageSlots)
    this._wireInspectorSignals()
    this._wireEditorSignals()
  }

  /** The chrome's own picks, which exist in both layouts. */
  private _wireEditorSignals(): void {
    this._editor.recentTiles.connect('tile-selected', (_r: unknown, tileId: number) => {
      if (this._activeTool === 'object' || this._activeTool === 'select') {
        this.activate_action('win.set-tool', GLib.Variant.new_string('pencil'))
      }
      this._setActiveTile(tileId)
    })
    // The sheet at Half covers the bottom of the map, so anything the
    // camera is asked to centre has to be centred in what is LEFT of it.
    // The inset is host state, not an op — it must never reach a peer's
    // camera, whose sheet is at its own detent.
    this._editor.connect('detent-changed', () => {
      this._engine?.setViewportInset({ bottom: this._editor.bottomInset })
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

  /** Mirror the global objects visibility into the Layers page's Objects row (no re-emit). */
  setObjectsVisible(visible: boolean): void {
    this._pages.layers.setObjectsState(this._mapData?.objectPlacements?.length ?? 0, visible)
  }

  /**
   * Mirror an engine-side layer-flag change (the `LAYER_FLAG_CHANGED`
   * event — fired for local toggles, undo/redo AND inbound peer ops)
   * into this view's `_layers` cache + the Layers page's eye/padlock
   * row state. The tab write is re-emit-free, so a mirrored change
   * never dispatches a second command. This is the single owner of
   * the cache update — the toggle handlers themselves don't write it
   * (anti-parallel-state: one mutating path).
   */
  setLayerFlag(layerId: string, flag: 'visible' | 'locked', value: boolean): void {
    const idx = this._layers.findIndex((l) => l.id === layerId)
    if (idx >= 0) this._layers[idx] = { ...this._layers[idx], [flag]: value }
    this._pages.layers.setLayerState(layerId, flag, value)
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

  /** The chip is the context pill's, not a header child — always present. */
  hasRosterChip(): boolean {
    return true
  }

  /**
   * `inspector-collapsed` is set only <768sp — the tablet breakpoint
   * collapses just the library — so it is the phone signal. The editor's
   * whole chrome switch hangs off it.
   */
  protected _onInspectorCollapsedChanged(collapsed: boolean): void {
    this._editor.setLayout(collapsed ? 'phone' : 'wide')
    // Re-parent, don't rebuild: `EditorPages` is the single set of page
    // widgets, so the layer list, the palette and the selection survive
    // the crossing with their state intact.
    this._pages.host(collapsed ? this._editor.pageSlots : this._inspector.pageSlots)
    // Shrinking a window with the drawer open leaves the property true
    // on a width that has no drawer, and the next reveal would then be a
    // no-op set. Shut it on the way in, not at the reveal.
    if (collapsed) this.showInspector = false
  }

  /**
   * On phone the editor has no inspector drawer — the three pages live
   * in the bottom sheet (`_onInspectorCollapsedChanged` hosts them
   * there), so the drawer would slide out empty. Every "reveal the
   * inspector" caller — `win.toggle-inspector`, `win.select-placement`,
   * `win.focus-placement` — therefore lands on the sheet instead, and
   * the property snaps back to `false` so the window's bidirectional
   * binding and the pill's toggle stay honest about a drawer that is
   * not open.
   */
  protected _onShowInspectorChanged(showInspector: boolean): void {
    if (!showInspector || !this.inspectorCollapsed) return
    this.showInspector = false
    this._editor.openSheet()
  }

  /**
   * Reveal the inspector BECAUSE something was selected on the canvas —
   * which on phone means not revealing it at all. REDESIGN § 5.4 is
   * explicit that a tap on a placement keeps the map visible and answers
   * in the bottom bar's second row (the name plus Edit · Copy · Move ·
   * Delete); a sheet sliding up over the thing just tapped would hide
   * the one piece of context the move verbs need. "Edit" is the opt-in,
   * and it goes through {@link showSheetPage} like every other page
   * request.
   *
   * On wide layouts the drawer still auto-opens, per the project-wide
   * policy in `docs/concepts/responsive-chrome.md`.
   */
  revealForSelection(): void {
    if (this.inspectorCollapsed) return
    this.showInspector = true
  }

  /** Push the tier down so the caption, the Play menu and "⋯" follow it. */
  protected _onFullViewChanged(fullView: boolean): void {
    this._editor.fullView = fullView
    // The Selected page's component editor hides its advanced specs in
    // Simple view, so the tier has to reach it too.
    this._pages.selected.fullView = fullView
  }

  /**
   * Forward the active editor tool to the tool chooser so its toggle
   * checks, and to the badge. The host calls this from the `win.set-tool`
   * action's change-state handler, which stays the only writer of engine
   * state — the chooser never checks itself on a click.
   *
   * The badge is tool-dependent in two ways: its corner disc carries the
   * tool's own icon, and its picture shows what that tool consumes — the
   * armed object under the Object tool, the active tile otherwise, a
   * checkerboard under Erase (which lays nothing) and a ghosted tile
   * under Select (which lays nothing either).
   */
  setActiveTool(tool: EditorTool): void {
    this._editor.toolGroup.setActiveTool(tool)
    if (this._activeTool === tool) return
    this._activeTool = tool
    this._syncContextChip()
  }

  /**
   * Mirror the armed object brush (from `win.set-object-brush`) into
   * the Brush page's Things grid + the context chip (when the Object
   * tool is active). `null` clears.
   */
  setArmedObjectBrush(defId: string | null): void {
    if (this._armedObjectId === defId) return
    this._armedObjectId = defId
    this._pages.brush.selectObjectBrush(defId)
    if (this._activeTool === 'object') this._syncContextChip()
  }

  /**
   * Sync the Selected page with a canvas-driven selection
   * (`PLACEMENT_SELECTED` event from the engine's select tool). Passing
   * `null` empties the page — matches what happens when the user clicks
   * empty tile space with the select tool active. The canvas-side
   * selection ring lives on the session-singleton's
   * `SelectedPlacementsComponent`, mutated inside
   * `TileEditorSystem.applySelect`, so it doesn't need to be re-applied
   * here.
   */
  highlightPlacement(placementId: string | null): void {
    this._syncSelectedObjectProps(placementId)
  }

  /**
   * Open the placement context menu at a canvas position (widget-local
   * pixels) — the long-press half of the selection above, which has
   * already run by the time this is called.
   */
  showPlacementMenu(screenX: number, screenY: number): void {
    this._editor.showPlacementMenu(screenX, screenY)
  }

  /** Confirm a pick at the brush badge — see `BrushBadge.pop`. */
  popBrushBadge(): void {
    this._editor.brushBadge.pop()
  }

  /**
   * Duplicate the selected placement onto a neighbouring tile and move
   * the selection to the copy — the "Copy" entry of the long-press
   * placement menu (REDESIGN § 9 step 1.4).
   *
   * Selecting the copy rather than leaving the original selected is what
   * makes a repeated Copy lay down a row: the next one duplicates the
   * one just made.
   */
  copySelectedPlacement(): void {
    const placementId = this._selectedPlacementId()
    if (placementId) this._duplicatePlacement(placementId)
  }

  /** Remove the selected placement — the menu's "Delete" entry. */
  deleteSelectedPlacement(): void {
    const placementId = this._selectedPlacementId()
    if (placementId) this._removePlacement(placementId)
  }

  /**
   * The single selected placement, or `null` when nothing (or more than
   * one thing) is selected — the menu entries act on one object, and
   * acting on "the first of several" would be a guess.
   */
  private _selectedPlacementId(): string | null {
    const selected = this._engine?.excalibur?.getSelectedPlacements() ?? []
    return selected.length === 1 ? selected[0] : null
  }

  /** Drop a placement from the map and clear it out of the Selected page. */
  private _removePlacement(placementId: string): void {
    if (!this._engine?.excalibur?.removeObject(placementId)) return
    this._syncSelectedObjectProps(null)
    this.emit('object-removed')
  }

  /** Push the selected placement into the Selected page (`null` shows its empty state). */
  private _syncSelectedObjectProps(placementId: string | null): void {
    const desc = placementId ? this._placementDescriptor(placementId) : null
    this._pages.selected.setPlacement(desc)
    // The phone bar's second row names the selection and offers its
    // verbs; with nothing selected it goes back to the recent tiles.
    this._editor.setPlacementSelected(desc?.definition.name ?? null)
  }

  /**
   * Describe one placement for the Selected page, reading the LIVE map
   * data — so a placement created, moved or edited a moment ago reads
   * correctly without a re-populate. `null` when the id is unknown or
   * its definition doesn't resolve (a `defId` pointing at a deleted
   * library entry): there is nothing honest to show.
   */
  private _placementDescriptor(placementId: string): SelectedPlacementDescriptor | null {
    const placement = this._mapData?.objectPlacements?.find((p) => p.id === placementId)
    if (!placement) return null
    const definition = resolvePlacementDefinition(placement, this._entityLibrary)
    const base = basePlacementDefinition(placement, this._entityLibrary)
    if (!definition || !base) return null
    return {
      placementId,
      defId: placement.defId ?? null,
      // What kind of thing this is: the library entry it instantiates,
      // or — for a placement carrying its own definition — a word for
      // "this one is not in the library".
      kind: placement.defId ? base.name : _('Inline object'),
      tileX: placement.tileX,
      tileY: placement.tileY,
      layerName: this._layers.find((l) => l.id === placement.layerId)?.name ?? placement.layerId,
      paintable: paintableFor(definition, this._objectSheets),
      definition,
      baseComponentTypes: base.components.map((c) => c.type),
    }
  }

  /**
   * An edit from the Selected page: diff the definition the user now
   * sees against the base it instantiates, and keep only the
   * differences as this placement's overrides. An edit set back to the
   * library's value therefore stops overriding at all, instead of
   * leaving a copy of the library in the map file.
   *
   * `placementId` comes from the page so a late emit from a placement
   * that is no longer selected cannot write onto the current one.
   */
  private _applyPlacementEdit(placementId: string, entityJson: string): void {
    const placement = this._mapData?.objectPlacements?.find((p) => p.id === placementId)
    if (!placement) return
    const base = basePlacementDefinition(placement, this._entityLibrary)
    if (!base) return
    let edited: EntityDefinition
    try {
      edited = JSON.parse(entityJson) as EntityDefinition
    } catch {
      return
    }
    const overrides = placementOverridesFrom(base, edited)
    if (!this._engine?.excalibur?.setPlacementOverrides(placementId, overrides)) return
    // The page shows the name and the kind; a committed rename has to
    // reach them, and the engine has already mutated the live map data.
    this._syncSelectedObjectProps(placementId)
    this._persistMapData()
  }

  /**
   * Duplicate the selected placement from the Selected page's
   * Duplicate row — same path as the long-press menu's "Copy", so both
   * leave the copy selected and the page showing it.
   */
  private _duplicatePlacement(placementId: string): void {
    const copyId = this._engine?.excalibur?.duplicatePlacement(placementId)
    if (!copyId) return
    this._engine?.setSelectedPlacements([copyId])
    this._syncSelectedObjectProps(copyId)
    this._pages.layers.setObjectsState(
      this._mapData?.objectPlacements?.length ?? 0,
      this._engine?.excalibur?.getEditorViewFlags().objectsVisible ?? true,
    )
    this._persistMapData()
  }

  /**
   * Arm the one-shot tap-to-move: the next tap with the select tool
   * moves this placement to the tapped tile instead of selecting what
   * is there. The engine holds the armed state (a session component) and
   * the system only ASKS for the move — `engine-controller` answers with
   * `Engine.movePlacement`, so the layer guard runs in one place.
   */
  armPlacementMove(): void {
    const placementId = this._selectedPlacementId()
    if (placementId) this._engine?.excalibur?.armPlacementMove(placementId)
  }

  /**
   * A placement the engine moved (the tap that consumed the arming, or
   * an undo/redo of one). Refresh the page's position row and persist.
   */
  placementMoved(placementId: string): void {
    this._syncSelectedObjectProps(placementId)
    this._persistMapData()
  }

  /** Whether the phone sheet is expanded over the canvas — back step 2. */
  get sheetOpen(): boolean {
    return this._editor.sheetOpen
  }

  /** Collapse the phone sheet to its peek bar; `false` if it was already there. */
  collapseSheet(): boolean {
    return this._editor.collapseSheet()
  }

  /**
   * Whether anything is selected on the map — back step 3. Unlike
   * {@link _selectedPlacementId} this counts a multi-selection too: back
   * clears whatever is highlighted, however much of it there is.
   */
  hasSelection(): boolean {
    return (this._engine?.excalibur?.getSelectedPlacements() ?? []).length > 0
  }

  /**
   * Drop the selection and take the highlight out of every surface that
   * shows it. Selection is awareness state (`SelectedPlacementsComponent`
   * over `SessionState`), not map data, so there is nothing to undo and
   * no `Command` to register.
   */
  clearSelection(): boolean {
    if (!this.hasSelection()) return false
    this._engine?.setSelectedPlacements([])
    this._syncSelectedObjectProps(null)
    return true
  }

  /**
   * Select one placement and move the camera onto it — what
   * `win.focus-placement` lands on after opening the map (§ 3.4). Same
   * steps as a canvas tap with the select tool.
   */
  focusPlacement(placementId: string): void {
    this._engine?.setSelectedPlacements([placementId])
    this._syncSelectedObjectProps(placementId)
    // Fire-and-forget: the engine resolves when the pan ends, or rejects
    // when a later pick wins.
    void this._engine?.focusOnPlacement(placementId)
  }

  /**
   * Show one of the three pages (`brush` / `layers` / `selected`) and
   * bring its container up: the bottom sheet on phone, the inspector
   * drawer when wide. Backs `win.sheet-page`, so tooling (the MCP
   * bridge) can reach the Things palette or the layer list, which are
   * otherwise click-only.
   *
   * Both stacks get the page, not just the visible one: the pages move
   * between the two containers on every breakpoint crossing, and a
   * stack left on its old page would show the wrong one after the move.
   *
   * Revealing is one statement at both widths: on phone
   * `_onShowInspectorChanged` turns it into the sheet.
   */
  showSheetPage(name: string): void {
    this._inspector.visiblePage = name
    this._editor.sheetPage = name
    this.showInspector = true
  }

  /** Header title + the floating chips. */
  setScene(scene: SampleScene): void {
    this.sceneName = scene.name
    this._editor.mapName = scene.name
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
   * Populate the three editor pages from a real loaded project. Reads
   * the active map's layers + first sprite-set from
   * `LoadedProject.resource` and feeds them into the brush / layers /
   * selected pages.
   */
  async populateFromProject(project: LoadedProject, sceneId: string): Promise<void> {
    const map = await project.resource.getMap(sceneId).catch(() => null)
    const mapData = map ?? project.resource.maps.get(sceneId)?.mapData
    if (!mapData) return

    const layers = toLayerDescriptors(mapData)
    this._layers = layers
    this._pages.layers.setLayers(layers)
    this._pages.layers.setObjectsState(
      mapData.objectPlacements?.length ?? 0,
      this._engine?.excalibur?.getEditorViewFlags().objectsVisible ?? true,
    )
    if (layers.length) {
      this._pages.layers.selectLayer(layers[0].id)
      this._setActiveLayer(layers[0].id)
    }

    await this._populateObjects(project, mapData)

    // Pick the first sprite set referenced by *this map* — that's the
    // one whose `firstGid` we need to offset against. Fall back to the
    // project-level list if the map doesn't pin a set.
    const mapSpriteSetRef = mapData.spriteSets?.[0]
    const firstSet = mapSpriteSetRef ?? project.resource.data?.spriteSets?.[0]
    await this._populateTilesets(project, mapData)
    if (firstSet) {
      await this.loadTileset(project, firstSet.id, mapSpriteSetRef?.firstGid ?? 1)
    } else {
      this._pages.brush.setSheet(null, null)
    }
  }

  /**
   * List the map's tilesets as chips above the sheet. Tapping one is the
   * only way to change the painting tileset, so every set the map
   * references has to appear here even when its sheet fails to load —
   * except that a chip without a sheet has nothing to show, so an
   * unloadable set is dropped rather than offered as a dead end.
   */
  private async _populateTilesets(project: LoadedProject, mapData: MapData): Promise<void> {
    const refs = mapData.spriteSets ?? project.resource.data?.spriteSets ?? []
    const chips: TilesetChipDescriptor[] = []
    for (const ref of refs) {
      const engineSet = await project.resource.getSpriteSet(ref.id).catch(() => null)
      if (!engineSet) continue
      const gdkSet = await GdkSpriteSetResource.fromEngineResource(engineSet)
      chips.push({
        id: ref.id,
        name: engineSet.data?.name ?? ref.id,
        thumbnail: gdkSet.createSheetThumbnail(TILESET_CHIP_THUMB_PX),
      })
    }
    this._pages.brush.setTilesets(chips, null)
  }

  /**
   * Fill the Brush page's Things grid and the per-placement lookup the
   * Selected page reads.
   *
   * Each placement resolves through the canonical resolver (inline, or
   * entity-library lookup by `defId`, with per-instance overrides merged);
   * falling back to the placement id keeps a placement named even when the
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
    this._pages.layers.heroPaintable = this._heroPaintable
    this._pages.brush.heroPaintable = this._heroPaintable

    // What the Selected page needs to describe any placement on demand:
    // the live map data, the library to resolve against and the sheets
    // the sprites come from. No per-placement snapshot — see `_mapData`.
    this._mapData = mapData
    this._entityLibrary = library
    this._objectSheets = sheets
    this._pages.selected.setComponentRegistry(effectiveComponentRegistry(project.resource.data))
    this._pages.selected.setRefOptions(buildRefOptions(project.resource.data?.maps, project.resource.spriteSets))

    const brushOptions = buildBrushOptions(brushDefs, sheets)
    this._objectBrushes = brushOptions
    this._pages.brush.setObjectBrushes(brushOptions)
    if (this._armedObjectId && !brushOptions.some((b) => b.id === this._armedObjectId)) this._armedObjectId = null
    this._pages.brush.selectObjectBrush(this._armedObjectId)
    // A re-populate (a removed object, a reloaded map) must not leave
    // the Selected page describing the placement list it replaced.
    this._syncSelectedObjectProps(this._selectedPlacementId())
  }

  /**
   * Load `spriteSetId` into the Brush page as the sheet being painted
   * from, offsetting tile ids by `firstGid`. Extracted from
   * {@link populateFromProject} so a tileset chip can re-point the sheet
   * at another of the map's tilesets (`win.select-tileset` resolves the
   * set + firstGid from the map's `spriteSets`).
   */
  async loadTileset(project: LoadedProject, spriteSetId: string, firstGid: number): Promise<void> {
    try {
      const engineSet = await project.resource.getSpriteSet(spriteSetId)
      if (!engineSet) return
      const gdkSet = await GdkSpriteSetResource.fromEngineResource(engineSet)
      const texture = gdkSet.imageTexture?.texture ?? null
      const layout = gdkSet.data
      if (!gdkSet.spriteSheet || !texture || !layout) return
      this._tilesetFirstGid = firstGid
      const tiles = this._sheetToTiles(gdkSet.spriteSheet)
      this._tiles = tiles
      this._pages.brush.setSheet(texture, sheetGridOf(layout, texture.get_width(), texture.get_height()))
      this._pages.brush.selectTileset(spriteSetId)
      // A fresh sheet starts the recency list over: ids are sheet-local,
      // so carrying the old ones across would ring the wrong swatches.
      this._recentTileIds = tiles.slice(0, 8).map((tile) => tile.id)
      this._refreshRecentTiles()
      if (tiles.length) this._setActiveTile(tiles[0].id)
    } catch (error) {
      console.warn('[SceneEditorView] Failed to load sprite set for Brush page:', error)
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
    this._pages.brush.selectTile(tileId)
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

  /** Make `layerId` the active layer — engine, top-bar chip and Layers page together. */
  selectLayer(layerId: string): void {
    this._setActiveLayer(layerId)
  }

  /**
   * Re-read the map's layer list into the Layers page + popover after a
   * `LAYER_LIST_CHANGED` (add / reorder / change of plane on ANY path —
   * local drop, undo, redo, a peer's op). Keeps the active layer; the
   * caller passes the live `mapData`, which is the single owner of the
   * order, so the tab never holds an order of its own.
   */
  refreshLayers(mapData: MapData): void {
    this._layers = toLayerDescriptors(mapData)
    this._pages.layers.setLayers(this._layers)
    const activeId = this._activeLayerId
    if (activeId) {
      this._pages.layers.selectLayer(activeId)
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
    this._pages.layers.selectLayer(layerId)
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
    this._pages.brush.layerName = this._activeLayerName
    this._pages.brush.setActivePlane(plane, populatedPlanes(this._layers))
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
   * A row dropped in the Layers page: same plane → a reorder, another
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
   * a tool chip, a tile chip and a layer chip — are now one square.
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
    wireBrushPage(this._pages.brush, {
      isObjectToolActive: () => this._activeTool === 'object',
      armPencilTool: () => this.activate_action('win.set-tool', GLib.Variant.new_string('pencil')),
      setActiveTile: (tileId) => this._setActiveTile(tileId),
      armObjectBrush: (defId) => this.activate_action('win.set-object-brush', GLib.Variant.new_string(defId)),
      selectTileset: (id) => this.activate_action('win.select-tileset', GLib.Variant.new_string(id)),
      selectPlane: (plane) => this._selectPlane(plane),
      openLayersPage: () => this.showSheetPage('layers'),
      collapseSheet: () => this._editor.collapseSheet(),
    })
    wireLayersPage(this._pages.layers, {
      setActiveLayer: (layerId) => this._setActiveLayer(layerId),
      setLayerVisible: (layerId, visible) => this._engine?.setLayerVisible(layerId, visible),
      setLayerLocked: (layerId, locked) => this._engine?.setLayerLocked(layerId, locked),
      moveLayer: (layerId, plane, index) => this._moveLayer(layerId, plane, index),
      persistMapData: () => this._persistMapData(),
      toggleObjectsVisibility: () => this.activate_action('win.toggle-objects', null),
    })
    wireSelectedPage(this._pages.selected, {
      openObjectDefinition: (defId) => this.activate_action('win.open-object', GLib.Variant.new_string(defId)),
      removePlacement: (placementId) => this._removePlacement(placementId),
      duplicatePlacement: (placementId) => this._duplicatePlacement(placementId),
      applyPlacementEdit: (placementId, entityJson) => this._applyPlacementEdit(placementId, entityJson),
    })
  }

  get sceneName(): string {
    return this._sceneName ?? ''
  }

  set sceneName(value: string) {
    if (this._sceneName === value) return
    this._sceneName = value
    this.notify('scene-name')
  }
}

GObject.type_ensure(SceneEditorView.$gtype)
