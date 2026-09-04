import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import type GObject from '@girs/gobject-2.0'

/** What the sidebar + view-flag actions need from the window. */
export interface InspectorActionsContext {
  /** Owner of the shared `show-library` property the toggle wraps. */
  sidebarOwner: GObject.Object
  /** Switch the scene inspector to a tab by name (tiles/layers/objects/props). */
  setInspectorTab(name: string): void
  /** Flip the visible view's own inspector sidebar. */
  toggleVisibleInspector(): void
  setEngineObjectsVisible(visible: boolean): void
  /** Mirror into the Layers tab's pinned "Objects" row (no re-emit). */
  setViewObjectsVisible(visible: boolean): void
  setEngineShowGrid(showGrid: boolean): void
  setEngineDimInactiveLayers(dim: boolean): void
}

/**
 * Sidebar toggles and the editor view flags.
 *
 * `toggle-library` is a `Gio.PropertyAction` because the OSD buttons live
 * in the cross-package `FloatingTopBar`, which a template binding cannot
 * reach; the atlas and welcome views bind `show-library` directly instead
 * (see `docs/concepts/responsive-chrome.md`).
 *
 * Grid lines and non-active-layer dimming are INDEPENDENT flags — grid
 * helps with tile alignment, dimming with layer focus — so each toggle
 * drives only its own.
 */
export function installInspectorActions(
  group: Gio.SimpleActionGroup,
  ctx: InspectorActionsContext,
): { objects: Gio.SimpleAction; grid: Gio.SimpleAction; transparency: Gio.SimpleAction } {
  const setInspectorTab = Gio.SimpleAction.new('set-inspector-tab', GLib.VariantType.new('s'))
  setInspectorTab.connect('activate', (_a, parameter) => {
    const name = parameter?.get_string()[0]
    if (name) ctx.setInspectorTab(name)
  })
  group.add_action(setInspectorTab)

  group.add_action(
    new Gio.PropertyAction({ name: 'toggle-library', object: ctx.sidebarOwner, property_name: 'show-library' }),
  )

  const toggleInspector = new Gio.SimpleAction({ name: 'toggle-inspector' })
  toggleInspector.connect('activate', () => ctx.toggleVisibleInspector())
  group.add_action(toggleInspector)

  const objects = Gio.SimpleAction.new_stateful('toggle-objects', null, GLib.Variant.new_boolean(true))
  objects.connect('change-state', (action, value) => {
    action.set_state(value!)
    const visible = value!.get_boolean()
    ctx.setEngineObjectsVisible(visible)
    ctx.setViewObjectsVisible(visible)
  })
  group.add_action(objects)

  const grid = Gio.SimpleAction.new_stateful('toggle-grid', null, GLib.Variant.new_boolean(false))
  grid.connect('change-state', (action, value) => {
    action.set_state(value!)
    ctx.setEngineShowGrid(value!.get_boolean())
  })
  group.add_action(grid)

  const transparency = Gio.SimpleAction.new_stateful('toggle-transparency', null, GLib.Variant.new_boolean(false))
  transparency.connect('change-state', (action, value) => {
    action.set_state(value!)
    ctx.setEngineDimInactiveLayers(value!.get_boolean())
  })
  group.add_action(transparency)

  return { objects, grid, transparency }
}
