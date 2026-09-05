/**
 * Reconciles the `win.*` actions the window really installs against
 * {@link WINDOW_ACTION_NAMES_BY_MODULE}, and pins the two facts a
 * same-named re-registration would silently destroy.
 *
 * `g_action_map_add_action` REPLACES an existing action rather than
 * reporting a conflict. This app already paid for that once: a
 * `Gio.PropertyAction` for `win.toggle-inspector` was registered first
 * and a stateless `Gio.SimpleAction` after it, so the PropertyAction was
 * dead and every `Gtk.ToggleButton` wired to the action had no state to
 * reflect — with nothing anywhere reporting it.
 *
 * SCOPE — five of the ten `install*Actions` modules are exercised here.
 * The other five (`view`, `project`, `cast`, `tile`, `object`) import
 * `gettext` for their toast msgids, which the node test target resolves
 * through `@gjsify/node-gi` — a package this workspace does not install,
 * and `src/test.mts` builds ONE graph for both targets. Their names are
 * still covered by the cross-module duplicate check in
 * `action-registry.spec.ts` and by `addAction`'s throw at registration
 * time; only the "declared set == installed set" reconciliation is
 * narrower than it should be. See TODO.md.
 *
 * GJS-only otherwise: `Gio.SimpleActionGroup` + `GObject.registerClass`
 * need the real gi stack, which the node target stubs. Skips there.
 */

import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import { describe, expect, it } from '@gjsify/unit'

import {
  addAction,
  DuplicateActionError,
  duplicateActionNames,
  WINDOW_ACTION_NAMES_BY_MODULE,
} from './action-registry.ts'
import { installEditingActions } from './editing-actions.ts'
import { installInspectorActions } from './inspector-actions.ts'
import { installPlaytestActions } from './playtest-actions.ts'
import { installSessionActions } from './session-actions.ts'
import { installZoomActions } from './zoom-actions.ts'

/** The modules this spec can install; the rest are gettext-bound (see the file header). */
const COVERED_MODULES = ['zoom', 'editing', 'inspector', 'playtest', 'session'] as const

const coveredNames = (): string[] => COVERED_MODULES.flatMap((key) => [...WINDOW_ACTION_NAMES_BY_MODULE[key]])

/** A real `Gio.SimpleActionGroup`, or `null` under the node target. */
function realActionGroup(): Gio.SimpleActionGroup | null {
  try {
    const group = new Gio.SimpleActionGroup()
    return typeof group.lookup_action === 'function' && typeof group.list_actions === 'function' ? group : null
  } catch {
    return null
  }
}

/** Read a boolean GObject property (GJS's `get_property` is the out-param form). */
function readBool(object: GObject.Object, property: string): boolean {
  const value = new GObject.Value()
  value.init(GObject.TYPE_BOOLEAN)
  object.get_property(property, value)
  return value.get_boolean()
}

/**
 * Stand-in for the window as the owner of the two shared sidebar
 * properties the `toggle-library` / `toggle-inspector` PropertyActions
 * wrap. Registered lazily so the node target never reaches it.
 */
let sidebarOwnerClass: (new () => GObject.Object) | null = null
function makeSidebarOwner(): GObject.Object {
  sidebarOwnerClass ??= GObject.registerClass(
    {
      GTypeName: 'PixelRpgSpecSidebarOwner',
      Properties: {
        'show-library': GObject.ParamSpec.boolean(
          'show-library',
          'Show library',
          'Spec stand-in for the window property',
          GObject.ParamFlags.READWRITE,
          false,
        ),
        'show-inspector': GObject.ParamSpec.boolean(
          'show-inspector',
          'Show inspector',
          'Spec stand-in for the window property',
          GObject.ParamFlags.READWRITE,
          false,
        ),
      },
    },
    class SpecSidebarOwner extends GObject.Object {},
  ) as unknown as new () => GObject.Object
  return new sidebarOwnerClass()
}

/**
 * Install the covered modules into one group, exactly as
 * `ApplicationWindow._installActions` does. Every context member is a
 * no-op: this exercises REGISTRATION, not behaviour.
 */
function installCovered(group: Gio.SimpleActionGroup, sidebarOwner: GObject.Object): void {
  const noop = () => {}
  installZoomActions(group, {
    targetsAtlas: () => false,
    stepAtlasZoom: noop,
    resetAtlasZoom: noop,
    fitAtlas: noop,
    stepEngineZoom: noop,
    resetEngineZoom: noop,
  })
  installEditingActions(group, {
    setEngineTool: noop,
    setViewTool: noop,
    setEngineObjectBrush: noop,
    setViewObjectBrush: noop,
    setSelectedPlacements: noop,
    highlightPlacement: noop,
    revealInspector: noop,
    undo: noop,
    redo: noop,
    createLayer: noop,
  })
  installInspectorActions(group, {
    sidebarOwner,
    setInspectorTab: noop,
    setEngineObjectsVisible: noop,
    setViewObjectsVisible: noop,
    setEngineShowGrid: noop,
    setEngineDimInactiveLayers: noop,
  })
  installPlaytestActions(group, { persistCurrentMap: noop, setRuntimeMode: noop, setViewPlaying: noop })
  installSessionActions(group, {
    presentShareDialog: noop,
    setAssistantPaused: noop,
    setEngineAssistantPaused: noop,
    setViewAssistantPaused: noop,
  })
}

export default async () => {
  await describe('win.* action group', async () => {
    await it('installs its modules without a duplicate registration', async () => {
      const group = realActionGroup()
      if (!group) return
      // A second registration of any name now throws instead of silently
      // replacing the first — so reaching this line at all is half the
      // assertion.
      installCovered(group, makeSidebarOwner())
      expect(duplicateActionNames([...group.list_actions()])).toStrictEqual([])
    })

    await it('installs exactly the declared names — no undeclared action, no missing one', async () => {
      const group = realActionGroup()
      if (!group) return
      installCovered(group, makeSidebarOwner())
      expect([...group.list_actions()].sort()).toStrictEqual(coveredNames().sort())
    })

    await it('refuses a same-named re-registration after the group is built', async () => {
      const group = realActionGroup()
      if (!group) return
      installCovered(group, makeSidebarOwner())

      let thrown: unknown = null
      try {
        addAction(group, new Gio.SimpleAction({ name: 'toggle-inspector' }))
      } catch (err) {
        thrown = err
      }
      expect(thrown instanceof DuplicateActionError).toBe(true)
      // …and the PropertyAction, not the intruder, is still in the group.
      expect(group.get_action_state_type('toggle-inspector')?.dup_string()).toBe('b')
    })

    await it('gives win.toggle-inspector boolean STATE bound to the sidebar property', async () => {
      const group = realActionGroup()
      if (!group) return
      const owner = makeSidebarOwner()
      installCovered(group, owner)

      // A stateless SimpleAction has no state type at all — a
      // Gtk.ToggleButton wired with `action-name` then has nothing to
      // reflect, which is what the OSD toggles were living with.
      expect(group.get_action_state_type('toggle-inspector')?.dup_string()).toBe('b')
      expect(group.get_action_state('toggle-inspector')?.get_boolean()).toBe(false)

      owner.set_property('show-inspector', true)
      expect(group.get_action_state('toggle-inspector')?.get_boolean()).toBe(true)

      // …and driving the action writes back through to the property.
      group.change_action_state('toggle-inspector', GLib.Variant.new_boolean(false))
      expect(readBool(owner, 'show-inspector')).toBe(false)
    })

    await it('gives win.toggle-library the same shape (the two sidebars stay symmetric)', async () => {
      const group = realActionGroup()
      if (!group) return
      installCovered(group, makeSidebarOwner())
      expect(group.get_action_state_type('toggle-library')?.dup_string()).toBe('b')
    })
  })
}
