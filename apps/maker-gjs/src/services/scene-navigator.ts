import { formatError } from '@pixelrpg/engine'
import type { SampleScene } from '@pixelrpg/gjs'
import type { LoadedProject } from './project-loader.ts'

/**
 * What the navigator needs from the window that hosts the scene editor.
 *
 * The two failure reports are callbacks rather than `showToast(_('…'))`
 * calls inside the navigator on purpose: a module that imports `gettext`
 * cannot be reached from `src/test.mts`, which builds ONE graph for both
 * the GJS and the node test target and only the former resolves it. The
 * msgids live in the window, which imports `gettext` anyway. See TODO.md.
 */
export interface SceneNavigatorContext {
  getProject(): LoadedProject | null
  /** Tell the user the requested map has no scene in the atlas. */
  reportMapMissing(): void
  /** Tell the user the engine could not be brought up for this map. */
  reportMapLoadFailed(): void
  /** Switch the window to the scene-editor page. */
  showSceneEditorPage(): void
  /** Push the scene's header + floating chips into the editor view. */
  setScene(scene: SampleScene): void
  /**
   * Catch the chrome up to a map the engine opened by itself. Unlike
   * {@link setScene} this must not touch the view's zoom — a teleport
   * carries the run's zoom across, and resetting the readout to 100%
   * would make the OSD lie about what is on screen.
   */
  followScene(scene: SampleScene): void
  /** Bring up (or reuse) the engine for `sceneId`; rejects on failure. */
  ensureEngineForMap(projectPath: string, sceneId: string): Promise<void>
  /** A fresh engine is live — re-push window state, attach a waiting session. */
  onEngineReady(): void
  /** Fill the inspector pages from the project's map data. */
  populateInspector(project: LoadedProject, sceneId: string): Promise<void>
  /** Re-render the atlas from the (possibly mutated) project scenes. */
  refreshAtlasWorld(project: LoadedProject): void
}

/**
 * Owns which scene the editor is on: the atlas scene index, the current
 * scene id, and the engine + inspector hydration that opening one needs.
 */
export class SceneNavigator {
  // Filled from the project's atlas scenes on load. Empty until a project
  // is opened — the scene editor is only reachable from the atlas, which
  // itself only renders once a project loaded.
  private _scenesById = new Map<string, SampleScene>()
  private _currentSceneId: string | null = null
  private _lastAtlasSelection: string | null = null

  constructor(private readonly ctx: SceneNavigatorContext) {}

  /** Which map the scene editor is currently editing. */
  get currentSceneId(): string | null {
    return this._currentSceneId
  }

  /** The loaded project's atlas scenes, in project order. */
  get scenes(): SampleScene[] {
    return [...this._scenesById.values()]
  }

  getScene(sceneId: string): SampleScene | null {
    return this._scenesById.get(sceneId) ?? null
  }

  setScenes(scenes: readonly SampleScene[]): void {
    this._scenesById = new Map(scenes.map((s) => [s.id, s]))
  }

  /** The atlas card the user last clicked — what `win.open-scene` opens. */
  get selectedAtlasSceneId(): string | null {
    return this._lastAtlasSelection
  }

  set selectedAtlasSceneId(sceneId: string | null) {
    this._lastAtlasSelection = sceneId
  }

  /**
   * Show `sceneId` in the scene editor.
   *
   * `onReady` runs once the map is fully hydrated — AFTER the inspector
   * populated, which is the earliest moment the view's own `MapData` is
   * the new map's. That is strictly later than `onEngineReady`, and the
   * difference matters for anything that then EDITS the map: a write
   * driven off the engine being up would still read the outgoing map's
   * placements (REDESIGN § 6.2's trip home). Never called for a map
   * that does not exist, and never called twice.
   */
  open(sceneId: string, onReady?: () => void): void {
    const scene = this._scenesById.get(sceneId)
    if (!scene) {
      this.ctx.reportMapMissing()
      return
    }
    this._currentSceneId = sceneId
    this.ctx.setScene(scene)
    this.ctx.showSceneEditorPage()

    // Real-data hydration only happens once a project is loaded; plain
    // demo scenes fall back to the view's placeholders.
    if (this.ctx.getProject()) void this._hydrate(sceneId, onReady)
    else onReady?.()
  }

  /**
   * Follow a map switch the ENGINE made: a teleport taken mid-run walks
   * the hero through a door and loads the destination without the
   * window asking for it.
   *
   * This is the inverse of {@link open} and does deliberately less. The
   * engine already has the map up, so there is nothing to ensure and no
   * page to show — only the chrome that names the current room (header
   * title, scene pill, inspector pages) and `_currentSceneId`, which
   * every later lookup reads.
   */
  followEngineMap(sceneId: string): void {
    if (sceneId === this._currentSceneId) return
    const scene = this._scenesById.get(sceneId)
    if (!scene) return
    this._currentSceneId = sceneId
    this.ctx.followScene(scene)

    const project = this.ctx.getProject()
    if (!project) return
    void this.ctx.populateInspector(project, sceneId).catch((error) => {
      console.warn('[SceneNavigator] Failed to populate inspector after a teleport:', error)
    })
  }

  /**
   * Re-read a map's persisted `editorData.atlasX/atlasY` into its atlas
   * card and re-render. The `SampleScene` objects are shared with the
   * project, so one in-place update covers both lookups.
   */
  refreshAtlasPosition(mapId: string): void {
    const project = this.ctx.getProject()
    if (!project) return
    const editorData = project.resource.maps.get(mapId)?.mapData?.editorData
    const scene = this._scenesById.get(mapId)
    if (!editorData || !scene) return
    if (typeof editorData.atlasX === 'number') scene.x = editorData.atlasX
    if (typeof editorData.atlasY === 'number') scene.y = editorData.atlasY
    this.ctx.refreshAtlasWorld(project)
  }

  private async _hydrate(sceneId: string, onReady?: () => void): Promise<void> {
    const project = this.ctx.getProject()
    if (!project) {
      onReady?.()
      return
    }

    // Order is load-bearing: the engine must be up before the inspector
    // populates, or its initial active-tile / active-layer writes land on
    // a not-yet-initialised Excalibur and silently vanish, breaking the
    // brush hover preview at startup.
    try {
      await this.ctx.ensureEngineForMap(project.projectPath, sceneId)
    } catch (error) {
      console.error('[SceneNavigator] Failed to bring up engine:', formatError(error))
      this.ctx.reportMapLoadFailed()
      // Fall through: the inspector still gives the user a usable
      // palette / layers / objects surface without a canvas.
    }

    this.ctx.onEngineReady()

    try {
      await this.ctx.populateInspector(project, sceneId)
    } catch (error) {
      console.warn('[SceneNavigator] Failed to populate inspector:', error)
    }

    // Even after a failed populate: the caller asked to be told when the
    // map is as ready as it is going to get, and swallowing the callback
    // would strand a flow waiting on it.
    onReady?.()
  }
}
