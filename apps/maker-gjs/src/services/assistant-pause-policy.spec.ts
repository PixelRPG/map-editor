import { describe, expect, it } from '@gjsify/unit'

import {
  AssistantPausedError,
  CONTROL_METHOD_KINDS,
  type ControlMethodKind,
  ControlUnavailableError,
  ENGINE_REQUIRED_ACTIONS,
  guardControlAction,
  guardControlMethod,
  guardEngineAction,
  HUMAN_ONLY_ACTIONS,
  HumanOnlyActionError,
} from './assistant-pause-policy.ts'
import { CONTROL_IFACE_XML } from './control-iface.ts'

/**
 * The expected classification of EVERY `org.pixelrpg.maker.Control`
 * method — the spec-side copy of the pause-contract table in
 * docs/concepts/ai-collaborator.md. A new D-Bus method must be added
 * to BOTH tables (the guard throws on unclassified names), so a
 * mismatch here means code and contract drifted.
 */
const EXPECTED_KINDS: Record<string, ControlMethodKind> = {
  GetStatus: 'read-only',
  Screenshot: 'read-only',
  ListActions: 'read-only',
  ListRecentProjects: 'read-only',
  ListTemplates: 'read-only',
  GetMapData: 'read-only',
  GetSessionState: 'read-only',
  PresentWindow: 'read-only',
  SetAssistantInfo: 'presence',
  SetAssistantCursor: 'presence',
  HideAssistant: 'presence',
  ActivateAction: 'mutating',
  ChangeActionState: 'mutating',
  OpenProject: 'mutating',
  StartSession: 'mutating',
  JoinSession: 'mutating',
  SetZoom: 'mutating',
  ResizeWindow: 'mutating',
  PaintTile: 'mutating',
  PlaceObject: 'mutating',
  FollowParticipant: 'mutating',
}

const MUTATING = Object.keys(EXPECTED_KINDS).filter((m) => EXPECTED_KINDS[m] === 'mutating')
const NON_MUTATING = Object.keys(EXPECTED_KINDS).filter((m) => EXPECTED_KINDS[m] !== 'mutating')

export default async () => {
  await describe('CONTROL_METHOD_KINDS (which-methods-gated table)', async () => {
    await it('classifies exactly the full Control interface, as documented', async () => {
      expect({ ...CONTROL_METHOD_KINDS }).toStrictEqual(EXPECTED_KINDS)
    })
  })

  await describe('guardControlMethod (paused mutating-call rejection)', async () => {
    await it('rejects every mutating method with a typed AssistantPausedError while paused', async () => {
      for (const method of MUTATING) {
        try {
          guardControlMethod(method, true)
          throw new Error(`expected ${method} to be rejected while paused`)
        } catch (error) {
          expect(error).toBeInstanceOf(AssistantPausedError)
          expect((error as Error).name).toBe('AssistantPausedError')
          // The message is the wire contract — it must name the cause + the way out.
          expect((error as Error).message.startsWith(`assistant-paused: ${method} rejected`)).toBe(true)
          expect((error as Error).message.includes('toggle-assistant-paused')).toBe(true)
        }
      }
    })

    await it('allows every mutating method when not paused', async () => {
      for (const method of MUTATING) {
        expect(() => guardControlMethod(method, false)).not.toThrow()
      }
    })

    await it('allows read-only + presence methods even while paused', async () => {
      for (const method of NON_MUTATING) {
        expect(() => guardControlMethod(method, true)).not.toThrow()
      }
    })

    await it('throws on an unclassified method (forces new methods through the policy)', async () => {
      expect(() => guardControlMethod('BrandNewMethod', false)).toThrow(/Unclassified Control method/)
    })
  })

  await describe('guardControlAction (control-plane unpause rejection)', async () => {
    await it('lists win.toggle-assistant-paused as human-only', async () => {
      expect([...HUMAN_ONLY_ACTIONS]).toStrictEqual(['toggle-assistant-paused'])
    })

    await it('rejects win.toggle-assistant-paused regardless of pause state (no self-un-pause)', async () => {
      try {
        guardControlAction('win', 'toggle-assistant-paused')
        throw new Error('expected a HumanOnlyActionError')
      } catch (error) {
        expect(error).toBeInstanceOf(HumanOnlyActionError)
        expect((error as Error).name).toBe('HumanOnlyActionError')
        expect((error as Error).message.startsWith('human-only-action: win.toggle-assistant-paused')).toBe(true)
      }
    })

    await it('allows every other action through (pause gating is guardControlMethod, not this)', async () => {
      expect(() => guardControlAction('win', 'undo')).not.toThrow()
      expect(() => guardControlAction('win', 'toggle-grid')).not.toThrow()
      expect(() => guardControlAction('app', 'quit')).not.toThrow()
    })
  })

  await describe('guardEngineAction (no silent no-op successes)', async () => {
    const noEngine = { engineReady: false, canUndo: false, canRedo: false }
    const emptyStacks = { engineReady: true, canUndo: false, canRedo: false }
    const fullStacks = { engineReady: true, canUndo: true, canRedo: true }

    await it('covers exactly the engine-backed actions', async () => {
      expect([...ENGINE_REQUIRED_ACTIONS].sort()).toStrictEqual([
        'play',
        'redo',
        'undo',
        'zoom-in',
        'zoom-out',
        'zoom-reset',
      ])
    })

    await it('rejects each engine-backed action with no-engine when no engine is live', async () => {
      for (const name of ENGINE_REQUIRED_ACTIONS) {
        try {
          guardEngineAction('win', name, noEngine)
          throw new Error(`expected win.${name} to be rejected without an engine`)
        } catch (error) {
          expect(error).toBeInstanceOf(ControlUnavailableError)
          expect((error as Error).message.startsWith('no-engine:')).toBe(true)
        }
      }
    })

    await it('rejects undo/redo on empty stacks with a typed nothing-to-… error', async () => {
      expect(() => guardEngineAction('win', 'undo', emptyStacks)).toThrow(/^nothing-to-undo:/)
      expect(() => guardEngineAction('win', 'redo', emptyStacks)).toThrow(/^nothing-to-redo:/)
    })

    await it('allows engine-backed actions when the engine can act', async () => {
      for (const name of ENGINE_REQUIRED_ACTIONS) {
        expect(() => guardEngineAction('win', name, fullStacks)).not.toThrow()
      }
    })

    await it('ignores non-engine actions — their state persists window-side and re-pushes', async () => {
      expect(() => guardEngineAction('win', 'toggle-grid', noEngine)).not.toThrow()
      expect(() => guardEngineAction('win', 'set-tool', noEngine)).not.toThrow()
      expect(() => guardEngineAction('app', 'undo', noEngine)).not.toThrow()
    })
  })

  await describe('CONTROL_IFACE_XML ↔ CONTROL_METHOD_KINDS drift guard', async () => {
    await it('every D-Bus method is classified for the pause policy, and vice-versa', async () => {
      // guardControlMethod throws at runtime for an unclassified method, but
      // only one that's actually invoked. This pins the whole set statically:
      // adding a method to the D-Bus XML without a pause classification (or
      // removing one and leaving the classification behind) fails here.
      const xmlMethods = [...CONTROL_IFACE_XML.matchAll(/<method name="([A-Za-z]+)"/g)].map((m) => m[1]).sort()
      const classified = Object.keys(CONTROL_METHOD_KINDS).sort()
      expect(xmlMethods).toStrictEqual(classified)
    })
  })
}
