import type Gio from '@girs/gio-2.0'
import { describe, expect, it } from '@gjsify/unit'

import {
  addAction,
  type ActionRegistry,
  DuplicateActionError,
  duplicateActionNames,
  WINDOW_ACTION_NAMES,
} from './action-registry.ts'

/** In-memory stand-in for `Gio.SimpleActionGroup`'s two `ActionMap` members. */
function makeRegistry() {
  const actions = new Map<string, Gio.Action>()
  const registry: ActionRegistry & { names(): string[] } = {
    names: () => [...actions.keys()],
    lookup_action: (name) => actions.get(name) ?? null,
    add_action: (action) => {
      actions.set(action.get_name(), action)
    },
  }
  return registry
}

const action = (name: string) => ({ get_name: () => name }) as unknown as Gio.Action

export default async () => {
  await describe('duplicateActionNames', async () => {
    await it('reports nothing for a clean list', async () => {
      expect(duplicateActionNames(['undo', 'redo', 'play'])).toStrictEqual([])
    })

    await it('reports each repeated name once', async () => {
      expect(duplicateActionNames(['undo', 'redo', 'undo', 'redo', 'undo'])).toStrictEqual(['undo', 'redo'])
    })
  })

  await describe('WINDOW_ACTION_NAMES', async () => {
    await it('declares no name twice', async () => {
      // `g_action_map_add_action` REPLACES a same-named action instead of
      // complaining, so a duplicate here is a registration that silently
      // never takes effect — exactly how `win.toggle-inspector`'s
      // PropertyAction ended up dead. `window-actions.gjs.spec.ts`
      // reconciles this list against a really-installed group.
      expect(duplicateActionNames(WINDOW_ACTION_NAMES)).toStrictEqual([])
    })

    await it('is not empty (a vacuous check would pass every future duplicate)', async () => {
      expect(WINDOW_ACTION_NAMES.length).toBeGreaterThan(30)
    })
  })

  await describe('addAction', async () => {
    await it('adds an action the group does not hold yet', async () => {
      const registry = makeRegistry()
      addAction(registry, action('undo'))
      addAction(registry, action('redo'))
      expect(registry.names()).toStrictEqual(['undo', 'redo'])
    })

    await it('REFUSES a name already registered instead of silently replacing it', async () => {
      const registry = makeRegistry()
      addAction(registry, action('toggle-inspector'))

      let thrown: unknown = null
      try {
        addAction(registry, action('toggle-inspector'))
      } catch (err) {
        thrown = err
      }

      expect(thrown instanceof DuplicateActionError).toBe(true)
      expect((thrown as DuplicateActionError).actionName).toBe('toggle-inspector')
      // …and the first registration is still the one in the group.
      expect(registry.names()).toStrictEqual(['toggle-inspector'])
    })
  })
}
