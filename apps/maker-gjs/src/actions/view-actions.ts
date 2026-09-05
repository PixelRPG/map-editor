import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { gettext as _ } from 'gettext'
import { resolveModeNavigation, type ViewName } from '../services/view-mode-map.ts'
import { addAction } from './action-registry.ts'

/** What the navigation actions need from the window. */
export interface ViewActionsContext {
  hasProject(): boolean
  /** The visible `Adw.ViewStack` page name. */
  currentView(): string | null
  setView(view: ViewName): void
  showToast(message: string): void
  /** Re-hydrate the lens behind `view` before showing it (cast / objects). */
  prepareView(view: ViewName): void
  /** The atlas card the user last selected — what `win.open-scene` opens. */
  selectedSceneId(): string | null
  openScene(sceneId: string): void
}

/**
 * `win.mode` plus the scene-navigation actions. Every view's mode rail
 * forwards its `mode-changed` through `win.mode`, so navigation is
 * consistent no matter which rail was clicked.
 */
export function installViewActions(group: Gio.SimpleActionGroup, ctx: ViewActionsContext): { mode: Gio.SimpleAction } {
  const mode = Gio.SimpleAction.new_stateful('mode', GLib.VariantType.new('s'), GLib.Variant.new_string('world'))
  mode.connect('change-state', (action, value) => {
    action.set_state(value!)
    const nav = resolveModeNavigation(value!.get_string()[0], ctx.hasProject(), ctx.currentView())
    if (nav.kind === 'navigate') {
      ctx.prepareView(nav.view)
      ctx.setView(nav.view)
      return
    }
    if (nav.kind === 'unimplemented') {
      ctx.showToast(_('Coming soon — this mode is not yet implemented'))
      // The state already advanced to a mode with no view behind it —
      // snap it back to whatever the visible page belongs to.
      mode.set_state(GLib.Variant.new_string(nav.fallback))
    }
  })
  addAction(group, mode)

  const backToAtlas = new Gio.SimpleAction({ name: 'back-to-atlas' })
  backToAtlas.connect('activate', () => ctx.setView('atlas'))
  addAction(group, backToAtlas)

  const openScene = new Gio.SimpleAction({ name: 'open-scene' })
  openScene.connect('activate', () => {
    const id = ctx.selectedSceneId()
    if (id) ctx.openScene(id)
  })
  addAction(group, openScene)

  const openSceneById = Gio.SimpleAction.new('open-scene-by-id', GLib.VariantType.new('s'))
  openSceneById.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (id) ctx.openScene(id)
  })
  addAction(group, openSceneById)

  return { mode }
}
