import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import type GObject from '@girs/gobject-2.0'
import { addAction } from './action-registry.ts'

/** What the sidebar + view-flag actions need from the window. */
export interface InspectorActionsContext {
  /**
   * Owner of the shared `show-inspector` property the sidebar toggle
   * wraps — the window, which binds it bidirectionally into every view.
   */
  sidebarOwner: GObject.Object
  /**
   * Show one of the three editor pages (brush/layers/selected) — in the
   * phone sheet or the wide inspector, whichever the layout is in.
   */
  showSheetPage(name: string): void
  setEngineObjectsVisible(visible: boolean): void
  setEngineShowGrid(showGrid: boolean): void
  setEngineDimInactiveLayers(dim: boolean): void
  setEngineShowWalls(showWalls: boolean): void
  /**
   * State `toggle-grid` starts in — the `show-grid-default` preference
   * (REDESIGN.md § 4.8). Only the initial state: the action never writes
   * back, so a session toggle does not change what the next one opens
   * with.
   */
  showGridDefault: boolean
}

/**
 * Sidebar toggles and the editor view flags.
 *
 * `toggle-inspector` is a `Gio.PropertyAction` over the window's shared
 * `show-inspector` property, because the OSD button lives in the
 * cross-package `SceneEditor` pills, which a template binding cannot
 * reach; the atlas and welcome views bind `show-inspector` directly
 * instead (see `docs/concepts/responsive-chrome.md`).
 *
 * There is no `toggle-library` counterpart any more: the library is a
 * destination of the shell's view switcher, not a drawer over the map
 * (REDESIGN.md § 3.2).
 *
 * `sheet-page('brush'|'layers'|'selected')` is the ONE way to reach a
 * page: the same three pages are hosted by the phone sheet or the wide
 * inspector depending on the layout, so callers name the page and let
 * the view decide which container to open (REDESIGN.md § 3.4).
 *
 * A PropertyAction carries boolean STATE, so a `Gtk.ToggleButton` wired
 * with `action-name` reflects the sidebar without any extra plumbing —
 * the reason `toggle-inspector` must not be a stateless `SimpleAction`.
 * The window's property is bound bidirectionally into every view, so
 * flipping it here reaches whichever view is on screen; no per-view
 * dispatch is needed (and the old one silently did nothing outside
 * atlas + scene-editor).
 *
 * Grid lines, non-active-layer dimming and the wall hatching are
 * INDEPENDENT flags — grid helps with tile alignment, dimming with layer
 * focus, hatching with spotting what blocks the hero — so each toggle
 * drives only its own.
 *
 * `toggle-walls` is reachable from two places (the view menu and a
 * toggle on the tileset sheet, REDESIGN.md § 6.5); both drive this one
 * action, so the sheet button and the menu item always agree.
 */
export function installInspectorActions(
  group: Gio.SimpleActionGroup,
  ctx: InspectorActionsContext,
): { objects: Gio.SimpleAction; grid: Gio.SimpleAction; transparency: Gio.SimpleAction; walls: Gio.SimpleAction } {
  const sheetPage = Gio.SimpleAction.new('sheet-page', GLib.VariantType.new('s'))
  sheetPage.connect('activate', (_a, parameter) => {
    const name = parameter?.get_string()[0]
    if (name) ctx.showSheetPage(name)
  })
  addAction(group, sheetPage)

  addAction(
    group,
    new Gio.PropertyAction({ name: 'toggle-inspector', object: ctx.sidebarOwner, property_name: 'show-inspector' }),
  )

  // "Show Things" lives in the view menu only (REDESIGN.md § 6.3) — the
  // Layers page no longer carries a row for it, so the action's own
  // state is the whole UI and nothing has to be mirrored back.
  const objects = Gio.SimpleAction.new_stateful('toggle-objects', null, GLib.Variant.new_boolean(true))
  objects.connect('change-state', (action, value) => {
    action.set_state(value!)
    ctx.setEngineObjectsVisible(value!.get_boolean())
  })
  addAction(group, objects)

  const grid = Gio.SimpleAction.new_stateful('toggle-grid', null, GLib.Variant.new_boolean(ctx.showGridDefault))
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

  const walls = Gio.SimpleAction.new_stateful('toggle-walls', null, GLib.Variant.new_boolean(false))
  walls.connect('change-state', (action, value) => {
    action.set_state(value!)
    ctx.setEngineShowWalls(value!.get_boolean())
  })
  addAction(group, walls)

  return { objects, grid, transparency, walls }
}
