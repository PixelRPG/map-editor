import type Adw from '@girs/adw-1'
import type Gtk from '@girs/gtk-4.0'
import type { EditorMode } from '@pixelrpg/gjs'
import { modeForView, routeForView, type ViewName } from './view-mode-map.ts'

/** What the router needs from the window whose pages it switches. */
export interface ViewRouterContext {
  /** The window's outer `Gtk.Stack`: welcome / shell / map. */
  getRootStack(): Gtk.Stack
  /** The project shell's `Adw.ViewStack`: world / library / game. */
  getShellStack(): Adw.ViewStack
  /** Current `win.mode` state, or `null` before the action is installed. */
  getMode(): string | null
  /** Write `win.mode` without re-entering its change-state handler. */
  setModeState(mode: EditorMode): void
  /** Navigation is leaving the map editor — drop the engine + play state. */
  onLeaveSceneEditor(): void
}

/**
 * Routes the window's two stacks and keeps the `win.mode` action state and
 * the map editor's engine lifetime in step with whichever page is visible.
 *
 * The shell's view switchers need no pushing: they are wired to the shell
 * `Adw.ViewStack` itself, so selecting a page updates every switcher that
 * watches it — which is why the mode rail's fan-out is gone.
 */
export class ViewRouter {
  constructor(private readonly ctx: ViewRouterContext) {}

  /** The visible view name, or `null` before the first navigation. */
  get currentView(): ViewName | null {
    const root = this.ctx.getRootStack().get_visible_child_name()
    if (root === 'welcome') return 'welcome'
    if (root === 'map') return 'map'
    if (root !== 'shell') return null
    return (this.ctx.getShellStack().get_visible_child_name() as ViewName | null) ?? null
  }

  setView(name: ViewName): void {
    // The gjs Engine widget nulls out its Excalibur instance in
    // `vfunc_unmap` (so an off-screen map editor doesn't hold a GL
    // context), which leaves a cached reference pointing at a dead
    // wrapper. Forcing a fresh engine on re-entry sidesteps that.
    //
    // `SceneEditorView` itself stays a child of `root_stack` throughout —
    // only its mapped state changes, never its parent (REDESIGN.md § 10,
    // risk 4).
    if (this.currentView === 'map' && name !== 'map') {
      this.ctx.onLeaveSceneEditor()
    }

    // Shell page first, then the root page: selecting the destination
    // before the shell becomes visible means the switcher never shows the
    // old page for a frame.
    const route = routeForView(name)
    if (route.shell) this.ctx.getShellStack().set_visible_child_name(route.shell)
    this.ctx.getRootStack().set_visible_child_name(route.root)

    const targetMode = modeForView(name)
    if (!targetMode) return
    if (this.ctx.getMode() !== targetMode) this.ctx.setModeState(targetMode)
  }
}
