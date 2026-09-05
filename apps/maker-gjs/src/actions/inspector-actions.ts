import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import type GObject from '@girs/gobject-2.0'
import { addAction } from './action-registry.ts'

/** What the sidebar + view-flag actions need from the window. */
export interface InspectorActionsContext {
  /**
   * Owner of the shared `show-library` / `show-inspector` properties the
   * two sidebar toggles wrap — the window, which binds both
   * bidirectionally into every view.
   */
  sidebarOwner: GObject.Object
  /** Switch the scene inspector to a tab by name (tiles/layers/objects/props). */
  setInspectorTab(name: string): void
  setEngineObjectsVisible(visible: boolean): void
  /** Mirror into the Layers tab's pinned "Objects" row (no re-emit). */
  setViewObjectsVisible(visible: boolean): void
  setEngineShowGrid(showGrid: boolean): void
  setEngineDimInactiveLayers(dim: boolean): void
}

/**
 * Sidebar toggles and the editor view flags.
 *
 * `toggle-library` and `toggle-inspector` are BOTH `Gio.PropertyAction`s
 * over the window's shared sidebar properties, because the OSD buttons
 * live in the cross-package `FloatingTopBar`, which a template binding
 * cannot reach; the atlas and welcome views bind `show-library` /
 * `show-inspector` directly instead (see
 * `docs/concepts/responsive-chrome.md`).
 *
 * A PropertyAction carries boolean STATE, so a `Gtk.ToggleButton` wired
 * with `action-name` reflects the sidebar without any extra plumbing —
 * the reason `toggle-inspector` must not be a stateless `SimpleAction`.
 * The window's property is bound bidirectionally into every view, so
 * flipping it here reaches whichever view is on screen; no per-view
 * dispatch is needed (and the old one silently did nothing outside
 * atlas + scene-editor).
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
  addAction(group, setInspectorTab)

  addAction(
    group,
    new Gio.PropertyAction({ name: 'toggle-library', object: ctx.sidebarOwner, property_name: 'show-library' }),
  )
  addAction(
    group,
    new Gio.PropertyAction({ name: 'toggle-inspector', object: ctx.sidebarOwner, property_name: 'show-inspector' }),
  )

  const objects = Gio.SimpleAction.new_stateful('toggle-objects', null, GLib.Variant.new_boolean(true))
  objects.connect('change-state', (action, value) => {
    action.set_state(value!)
    const visible = value!.get_boolean()
    ctx.setEngineObjectsVisible(visible)
    ctx.setViewObjectsVisible(visible)
  })
  addAction(group, objects)

  const grid = Gio.SimpleAction.new_stateful('toggle-grid', null, GLib.Variant.new_boolean(false))
  grid.connect('change-state', (action, value) => {
    action.set_state(value!)
    ctx.setEngineShowGrid(value!.get_boolean())
  })
  addAction(group, grid)

  const transparency = Gio.SimpleAction.new_stateful('toggle-transparency', null, GLib.Variant.new_boolean(false))
  transparency.connect('change-state', (action, value) => {
    action.set_state(value!)
    ctx.setEngineDimInactiveLayers(value!.get_boolean())
  })
  addAction(group, transparency)

  return { objects, grid, transparency }
}
