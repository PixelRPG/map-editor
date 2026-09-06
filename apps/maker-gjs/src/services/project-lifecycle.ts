import GLib from '@girs/glib-2.0'
import type Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'
import { chooseNewProjectFolder, chooseProjectFile } from './project-dialogs.ts'
import { type LoadedProject, loadProjectAsAtlas } from './project-loader.ts'
import { hasProjectFile, scaffoldProjectFrom } from './project-scaffold.ts'
import { loadRecentProjects, recordRecentProject } from './recent-projects.ts'
import { findBlankTemplate, findTemplateById } from './templates.ts'

/** What opening and closing a project needs from the window. */
export interface ProjectLifecycleContext {
  /** Modal parent for the file pickers. */
  getWindow(): Gtk.Window
  showToast(message: string): void
  /** Hand the project (or `null`) to the store — the single owner of it. */
  setProject(project: LoadedProject | null): void
  /** Adopt the project into the views: names, atlas world, scene index. */
  adoptProject(project: LoadedProject): void
  /** Drop per-project view state that must not leak into the next project. */
  resetViews(): void
  /** Re-render the welcome view's recent-projects column. */
  refreshRecentProjects(recent: ReturnType<typeof loadRecentProjects>): void
  /** `win.share-session` availability follows "a project is open". */
  setShareEnabled(enabled: boolean): void
  showAtlas(): void
  showWelcome(): void
  /** Force a fresh engine project load on the next scene-editor entry. */
  invalidateEngine(): void
  /** Full engine teardown (close only). */
  disposeEngine(): void
  /** Leave any live host/join session. */
  leaveSession(): Promise<void>
  /** Detach the collab sink from the project store. */
  detachCollab(): void
}

/** Opening, creating, scaffolding and closing the active project. */
export class ProjectLifecycle {
  constructor(private readonly ctx: ProjectLifecycleContext) {}

  /** "Open Project" → real file picker. */
  openFromDialog(): void {
    chooseProjectFile(this.ctx.getWindow(), (path) => void this.load(path))
  }

  /**
   * "New Project" → scaffold a fresh copy of the blank starter into a
   * user-chosen folder, then open it. Opening the template in place would
   * silently overwrite the repo's `games/blank-starter` files.
   */
  create(): void {
    const blank = findBlankTemplate()
    if (!blank) {
      this.ctx.showToast(_('No blank template available'))
      return
    }
    chooseNewProjectFolder(this.ctx.getWindow(), (dir) => {
      if (hasProjectFile(dir)) {
        this.ctx.showToast(_('That folder already contains a project.'))
        return
      }
      if (!scaffoldProjectFrom(GLib.path_get_dirname(blank.projectPath), dir)) {
        this.ctx.showToast(_('Could not create the project.'))
        return
      }
      void this.load(GLib.build_filenamev([dir, 'game-project.json']))
    })
  }

  /** Open a starter template by id (the welcome view's template cards). */
  openTemplate(templateId: string): void {
    const template = findTemplateById(templateId)
    if (!template) {
      this.ctx.showToast(_('Template not found'))
      return
    }
    void this.load(template.projectPath)
  }

  async load(projectPath: string): Promise<void> {
    this.ctx.showToast(_('Loading project…'))
    try {
      const project = await loadProjectAsAtlas(projectPath)
      this.ctx.setShareEnabled(true)
      this.ctx.adoptProject(project)
      this.ctx.setProject(project)
      this.ctx.resetViews()
      this.ctx.invalidateEngine()
      const caption = (project.resource.data?.properties?.description as string | undefined) ?? ''
      recordRecentProject({
        path: projectPath,
        name: project.projectName,
        caption,
        sceneCount: project.scenes.length,
      })
      this.ctx.refreshRecentProjects(loadRecentProjects())
      this.ctx.showAtlas()
    } catch (error) {
      console.error('[ProjectLifecycle] Failed to load project:', error)
      this.ctx.showToast(_('Failed to load project'))
    }
  }

  /**
   * Open a shared-session sandbox project. Engine attachment is deferred
   * to the first scene-editor entry: the atlas loads before any scene
   * navigation, so there is no engine to attach here on a joiner's first
   * session (see `SessionCoordinator.attachEngineIfAwaiting`).
   */
  async loadSandbox(projectPath: string): Promise<void> {
    try {
      await this.load(projectPath)
      this.ctx.showToast(_('Joined shared session — open a map to start editing.'))
    } catch (err) {
      this.ctx.showToast(_(`Could not open shared session: ${(err as Error).message}`))
    }
  }

  /**
   * Tear down the active project + any live session before returning to
   * the welcome view — the reverse of {@link load}. Switching the view
   * alone would leak the project, the session and the engine, and layer
   * any reopened project on stale state.
   */
  async close(): Promise<void> {
    try {
      await this.ctx.leaveSession()
    } catch (err) {
      console.warn('[ProjectLifecycle] leaveSession during close failed:', err)
    }
    this.ctx.detachCollab()
    this.ctx.disposeEngine()
    this.ctx.setProject(null)
    this.ctx.setShareEnabled(false)
    this.ctx.showWelcome()
  }
}
