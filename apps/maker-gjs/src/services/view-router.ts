import type Adw from '@girs/adw-1'
import type { EditorMode } from '@pixelrpg/gjs'
import { modeForView, type ViewName } from './view-mode-map.ts'

/** A view that owns a `ModeRail` instance. */
export interface ModeRailHost {
  syncActiveMode(mode: EditorMode): void
}

/** What the router needs from the window whose pages it switches. */
export interface ViewRouterContext {
  /** The window's page stack. */
  getStack(): Adw.ViewStack
  /**
   * Every view carrying a mode rail. Rails only auto-update on their OWN
   * row clicks, so a navigation that bypasses a click (opening a scene
   * from the atlas, or any programmatic switch) has to push the active
   * mode into all of them or the destination shows a stale row.
   */
  getRails(): readonly ModeRailHost[]
  /** Current `win.mode` state, or `null` before the action is installed. */
  getMode(): string | null
  /** Write `win.mode` without re-entering its change-state handler. */
  setModeState(mode: EditorMode): void
  /** Whether the mode rail is currently an overlay drawer rather than pinned. */
  isRailOverlay(): boolean
  /** Dismiss the library drawer that hosts the rail. */
  hideLibrary(): void
  /** Navigation is leaving the scene editor — drop the engine + play state. */
  onLeaveSceneEditor(): void
}

/**
 * Routes the window's `Adw.ViewStack` and keeps the mode rails, the
 * `win.mode` action state and the scene-editor engine lifetime in step
 * with whichever page is visible.
 */
export class ViewRouter {
  constructor(private readonly ctx: ViewRouterContext) {}

  /** The visible page name, or `null` before the first navigation. */
  get currentView(): string | null {
    return this.ctx.getStack().get_visible_child_name()
  }

  setView(name: ViewName): void {
    // The gjs Engine widget nulls out its Excalibur instance in
    // `vfunc_unmap` (so an off-screen scene editor doesn't hold a GL
    // context), which leaves a cached reference pointing at a dead
    // wrapper. Forcing a fresh engine on re-entry sidesteps that.
    if (this.currentView === 'scene-editor' && name !== 'scene-editor') {
      this.ctx.onLeaveSceneEditor()
    }
    this.ctx.getStack().set_visible_child_name(name)

    // Picking a page through an overlay rail should dismiss it, or the
    // chosen view stays covered. Pinned rails (wide layouts) stay put.
    if (name !== 'welcome' && this.ctx.isRailOverlay()) this.ctx.hideLibrary()

    const targetMode = modeForView(name)
    if (!targetMode) return
    if (this.ctx.getMode() !== targetMode) this.ctx.setModeState(targetMode)
    this.syncModeRails(targetMode)
  }

  /** Push `mode` into every view's rail, not just the visible one. */
  syncModeRails(mode: EditorMode): void {
    for (const rail of this.ctx.getRails()) rail.syncActiveMode(mode)
  }
}
