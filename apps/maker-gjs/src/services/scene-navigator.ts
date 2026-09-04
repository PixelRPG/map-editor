import { formatError } from '@pixelrpg/engine'
import type { SampleScene } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'
import type { LoadedProject } from './project-loader.ts'

/** What the navigator needs from the window that hosts the scene editor. */
export interface SceneNavigatorContext {
  getProject(): LoadedProject | null
  showToast(message: string): void
  /** Switch the window to the scene-editor page. */
  showSceneEditorPage(): void
  /** Push the scene's header + floating chips into the editor view. */
  setScene(scene: SampleScene): void
  /** Bring up (or reuse) the engine for `sceneId`; rejects on failure. */
  ensureEngineForMap(projectPath: string, sceneId: string): Promise<void>
  /** A fresh engine is live — re-push window state, attach a waiting session. */
  onEngineReady(): void
  /** Fill the inspector tabs from the project's map data. */
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

  open(sceneId: string): void {
    const scene = this._scenesById.get(sceneId)
    if (!scene) {
      this.ctx.showToast(_('Scene not found'))
      return
    }
    this._currentSceneId = sceneId
    this.ctx.setScene(scene)
    this.ctx.showSceneEditorPage()

    // Real-data hydration only happens once a project is loaded; plain
    // demo scenes fall back to the view's placeholders.
    if (this.ctx.getProject()) void this._hydrate(sceneId)
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

  private async _hydrate(sceneId: string): Promise<void> {
    const project = this.ctx.getProject()
    if (!project) return

    // Order is load-bearing: the engine must be up before the inspector
    // populates, or its initial active-tile / active-layer writes land on
    // a not-yet-initialised Excalibur and silently vanish, breaking the
    // brush hover preview at startup.
    try {
      await this.ctx.ensureEngineForMap(project.projectPath, sceneId)
    } catch (error) {
      console.error('[SceneNavigator] Failed to bring up engine:', formatError(error))
      this.ctx.showToast(_('Failed to load map'))
      // Fall through: the inspector still gives the user a usable
      // palette / layers / objects surface without a canvas.
    }

    this.ctx.onEngineReady()

    try {
      await this.ctx.populateInspector(project, sceneId)
    } catch (error) {
      console.warn('[SceneNavigator] Failed to populate inspector:', error)
    }
  }
}
