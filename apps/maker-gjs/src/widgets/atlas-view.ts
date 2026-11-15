import type Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type { GameProjectResource } from '@pixelrpg/engine'
import {
  AtlasCanvas,
  AtlasOverview,
  FloatingFab,
  FloatingZoom,
  MapSelectionBar,
  mapSelectionFacts,
  ProjectMenuButton,
  RosterChip,
  SAMPLE_SCENES,
  SAMPLE_TELEPORTS,
  type SampleScene,
  type SampleTeleport,
  SignalScope,
  worldFitsViewport,
} from '@pixelrpg/gjs'

import { loadAtlasCamera, saveAtlasCamera } from '../services/atlas-camera-store.ts'
import Template from './atlas-view.blp'
import { ResponsiveEditorView, type ResponsiveEditorViewSignals } from './responsive-editor-view.ts'

GObject.type_ensure(ProjectMenuButton.$gtype)
GObject.type_ensure(RosterChip.$gtype)
GObject.type_ensure(AtlasCanvas.$gtype)
GObject.type_ensure(MapSelectionBar.$gtype)
GObject.type_ensure(FloatingFab.$gtype)
GObject.type_ensure(FloatingZoom.$gtype)
GObject.type_ensure(AtlasOverview.$gtype)

/**
 * Typed view of the signals {@link AtlasView} registers, layered on the parent's
 * own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface AtlasViewSignals extends ResponsiveEditorViewSignals {
  'scene-opened': (sceneId: string) => void
  'scene-selected': (sceneId: string) => void
  'scene-moved': (sceneId: string, x: number, y: number) => void
}

/**
 * Maker-app **World** view — the atlas canvas and nothing beside it.
 * What the selected map is and what can be done with it rides the
 * bottom-centre {@link MapSelectionBar}, which replaced the right-hand
 * scene inspector (REDESIGN.md § 4.2 / § 5.4).
 *
 * Navigation between the shell's three destinations is the header's
 * `Adw.ViewSwitcher` (wide) or the window's `Adw.ViewSwitcherBar`
 * (phone) — this view carries no sidebar of its own.
 *
 * Emits `scene-opened::<id>` so the application window can swap to the
 * map editor.
 */
export class AtlasView extends ResponsiveEditorView {
  declare _atlas: AtlasCanvas
  declare _selection_bar: MapSelectionBar
  declare _preview_zoom: FloatingZoom
  declare _atlas_overview: AtlasOverview
  declare _overview_frame: Adw.Bin

  private signals = new SignalScope()
  private _scenes: SampleScene[] = SAMPLE_SCENES
  private _teleports: SampleTeleport[] = SAMPLE_TELEPORTS
  /**
   * Path of the project whose camera {@link _saveCamera} writes — the
   * key the camera store is indexed by. `null` while the demo world is
   * showing, which has no project to remember a camera for.
   */
  private _projectPath: string | null = null
  /**
   * The phone instance of the selection bar, which lives in the
   * window's bottom bar: a Blueprint `bind` cannot cross a template
   * boundary, so the window hands it over with
   * {@link attachSelectionBar}. Both instances are fed from
   * {@link _refreshSelection} — one selection, two surfaces.
   */
  private _phoneSelectionBar: MapSelectionBar | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'AtlasView',
        Template,
        InternalChildren: [
          'view_switcher',
          'roster_chip',
          'atlas',
          'selection_bar',
          'preview_zoom',
          'atlas_overview',
          'overview_frame',
        ],
        // show-inspector / inspector-collapsed / compact / full-view are
        // inherited from ResponsiveEditorView.
        Signals: {
          'scene-opened': { param_types: [GObject.TYPE_STRING] },
          'scene-selected': { param_types: [GObject.TYPE_STRING] },
          'scene-moved': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_INT, GObject.TYPE_INT],
          },
        },
      },
      AtlasView,
    )
  }

  declare connect: GObject.SignalMethods<this, AtlasViewSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, AtlasViewSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, AtlasViewSignals>['emit']

  constructor() {
    super()
    this._atlas.setWorld(this._scenes, this._teleports)
    this._preview_zoom.setZoom(this._atlas.zoom)
    // The atlas is the only view with a fit target, so it opts the
    // shared zoom pill into showing the Fit button.
    this._preview_zoom.showFit = true
    this._atlas.fit()
  }

  /**
   * Hand over the bottom-bar instance of the selection bar. Called once
   * by the window, which owns the bar's visibility (it swaps the bottom
   * bar between the view switcher and the selection) — this view only
   * ever fills it with content.
   */
  attachSelectionBar(bar: MapSelectionBar): void {
    this._phoneSelectionBar = bar
    bar.floating = false
    this._refreshSelection()
  }

  /** Re-sync the overview minimap's scene rects + viewport frame from the canvas. */
  private _refreshOverview(): void {
    const { width, height } = this._atlas.contentSize
    this._atlas_overview.setContent(this._atlas.sceneRects(), width, height)
    const vp = this._atlas.viewportRect()
    this._atlas_overview.setViewport(vp.x, vp.y, vp.w, vp.h)
    // A world that already fits the canvas needs no map of itself, and
    // on phone widths the OSD would eat a third of the canvas
    // (REDESIGN.md § 4.2) — there the pinch gesture is the only camera.
    // The test is the cards' own bounding box against the viewport, not
    // the surface: the surface always carries padding on every side, so
    // measuring it would keep the minimap up for every world there is.
    const fits = worldFitsViewport(this._atlas.sceneRects(), { w: vp.w, h: vp.h })
    this._overview_frame.set_visible(!fits && !this.compact)
  }

  /**
   * Zoom out until the whole world fits, then centre it (the Fit
   * affordance). The window routes `win.atlas-fit` here while the atlas
   * is visible.
   */
  fitAtlas(): void {
    this._atlas.fit()
  }

  /**
   * Select one map's card and centre the camera on it — where back from
   * the map editor lands (REDESIGN.md § 3.4, step 5). The zoom the user
   * left behind is kept; only the scroll offset moves. Unknown ids leave
   * the camera where it is.
   */
  focusScene(id: string): void {
    if (!this._scenes.some((scene) => scene.id === id)) return
    this._atlas.selectedId = id
    this._refreshSelectedScene(id)
    this._atlas.focusScene(id)
  }

  /**
   * Step the atlas camera zoom (the window routes `win.zoom-in/out`
   * here while the atlas is the visible view).
   *
   * The delta is applied as a RATIO, not an offset: the camera spans
   * 10 %–400 %, so the engine editor's flat ±0.2 would be one click from
   * end to end down at the bottom and a rounding error at the top.
   */
  stepZoom(delta: number): void {
    const factor = 1 + Math.abs(delta)
    this.setZoom(delta >= 0 ? this._atlas.zoom * factor : this._atlas.zoom / factor)
  }

  /** Absolute camera zoom; mirrors the value into the OSD pill. */
  setZoom(zoom: number): void {
    this._atlas.setZoom(zoom)
  }

  /** Back to 100 % (`win.zoom-reset` in the atlas). */
  resetZoom(): void {
    this.setZoom(1)
  }

  /**
   * Remember where the user is looking, so reopening this project lands
   * on the same view. No-op for the demo world and while the canvas has
   * no allocation yet (a zero-sized viewport would persist a camera the
   * user never chose).
   *
   * An untouched, still-fitted atlas is stored as `null`, which forgets
   * any earlier entry: a fit is only valid for the window size it was
   * computed at, so the next session should re-fit rather than restore a
   * zoom that no longer fills the window.
   */
  private _saveCamera(): void {
    if (!this._projectPath) return
    const { h } = this._atlas.adjustments
    if (h.page_size <= 0) return
    saveAtlasCamera(this._projectPath, this._atlas.isFitted ? null : this._atlas.camera)
  }

  /**
   * Replace the demo world with a real project's data. Optionally pass
   * the loaded `GameProjectResource` so the atlas cards can render real
   * tile previews of each map, and the project's path so its camera can
   * be remembered across sessions.
   */
  setWorld(
    scenes: SampleScene[],
    teleports: SampleTeleport[],
    projectResource: GameProjectResource | null = null,
    projectPath: string | null = null,
  ): void {
    // Switching projects: bank the outgoing one's camera before the
    // path changes, or it is lost. A reload of the SAME project (a map
    // added, renamed, deleted) keeps its camera below instead.
    if (this._projectPath && this._projectPath !== projectPath) this._saveCamera()
    // Read the live camera before the canvas re-lays out, so a reload
    // of the same project resumes from where the user actually was
    // rather than from a clamped intermediate.
    const sameProject = projectPath !== null && this._projectPath === projectPath
    // A still-fitted camera is not worth resuming — re-fitting also
    // takes the new map into account, which a restore would crop out.
    const current = this._atlas.isFitted ? null : this._atlas.camera
    this._scenes = scenes
    this._teleports = teleports
    this._projectPath = projectPath
    this._atlas.setWorld(scenes, teleports, projectResource)
    this._atlas.setStartMapId(projectResource?.data?.startup?.initialMapId ?? null)
    // The selected card survives a reload of the same project, so the
    // bar is re-derived rather than cleared — a map renamed or resized
    // under the selection updates in place.
    this._refreshSelection()
    // Reopen a project where the user left it; a project seen for the
    // first time opens fitted so every map is reachable at once,
    // instead of the old 200 % top-left dump that ran off-viewport.
    // A same-project reload must not yank the camera either.
    const remembered = sameProject ? current : projectPath ? loadAtlasCamera(projectPath) : null
    if (remembered) this._atlas.restoreCamera(remembered)
    else this._atlas.fit()
    this._refreshOverview()
  }

  /**
   * Push whatever the canvas currently has selected into both
   * selection bars. Reads `selectedId` from the canvas rather than
   * taking an id, so it is equally correct after a selection, after a
   * project reload and right after a bar is attached.
   */
  private _refreshSelection(): void {
    const id = this._atlas.selectedId
    const scene = id ? (this._scenes.find((s) => s.id === id) ?? null) : null
    const facts = scene ? mapSelectionFacts(scene, this._teleports) : null
    this._selection_bar.setMap(scene?.name ?? null, facts)
    this._phoneSelectionBar?.setMap(scene?.name ?? null, facts)
  }

  /**
   * Shared selection write — used by both `scene-selected` (click) and
   * `scene-drag-began` (drag-start). Refreshes the selection bars and
   * forwards the selection upward to the application window.
   */
  private _refreshSelectedScene(id: string): void {
    this._refreshSelection()
    this.emit('scene-selected', id)
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._atlas, 'scene-selected', (_a: AtlasCanvas, id: string) => {
      this._refreshSelectedScene(id)
    })
    this.signals.connect(this._atlas, 'scene-drag-began', (_a: AtlasCanvas, id: string) => {
      // Drag-start IS a selection: the bar should name the card the
      // user has picked up, so dropping it somewhere and then hitting
      // Open acts on the map they just moved.
      this._refreshSelectedScene(id)
    })
    this.signals.connect(this._atlas, 'scene-opened', (_a: AtlasCanvas, id: string) => {
      this.emit('scene-opened', id)
    })
    this.signals.connect(this._atlas, 'scene-moved', (_a: AtlasCanvas, id: string, x: number, y: number) => {
      this.emit('scene-moved', id, x, y)
    })
    // Zoom reached by pinch, Ctrl+scroll or Fit — mirror it into the
    // OSD pill's percentage label. Pans do not change it.
    this.signals.connect(this._atlas, 'camera-changed', () => {
      this._preview_zoom.setZoom(this._atlas.zoom)
      this._refreshOverview()
    })
    // Overview minimap: redraw scene rects when the world changes, and
    // track the viewport frame as the user pans/scrolls.
    this.signals.connect(this._atlas, 'world-changed', () => this._refreshOverview())
    const { h, v } = this._atlas.adjustments
    this.signals.connect(h, 'value-changed', () => this._refreshOverview())
    this.signals.connect(v, 'value-changed', () => this._refreshOverview())
    this.signals.connect(h, 'notify::page-size', () => this._refreshOverview())
    this.signals.connect(v, 'notify::page-size', () => this._refreshOverview())
    this._refreshOverview()
  }

  vfunc_unmap(): void {
    // Leaving the World view (to the map editor, to Cast, or closing the
    // window) is the moment the camera is final. Saving on every pan
    // would write the store dozens of times a second.
    this._saveCamera()
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(AtlasView.$gtype)
