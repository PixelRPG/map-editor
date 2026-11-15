/**
 * `mergeInputIntents` — the rule by which two local input producers
 * (host keyboard + on-screen touch controls) become the single
 * `InputSourceComponent` gameplay reads.
 *
 * Pinned here rather than in a GTK test because touch cannot be
 * injected into the headless harness: this is the only place the
 * "whoever is steering wins, buttons OR together" contract can be
 * proven, and the properties it protects (no cancellation, no speed
 * boost) are exactly the ones that would otherwise surface as a vague
 * "the hero feels wrong on my phone".
 */

import { describe, expect, it } from '@gjsify/unit'

import { type InputIntent, mergeInputIntents } from './player-input.ts'

const NEUTRAL: InputIntent = { moveX: 0, moveY: 0, actionHeld: false, attackHeld: false }

function intent(partial: Partial<InputIntent>): InputIntent {
  return { ...NEUTRAL, ...partial }
}

export default async () => {
  await describe('mergeInputIntents — keyboard + touch', async () => {
    await it('passes the keyboard through when there is no touch producer', async () => {
      const merged = mergeInputIntents(intent({ moveX: -1, actionHeld: true }), null)
      expect(merged.moveX).toBe(-1)
      expect(merged.actionHeld).toBe(true)
    })

    await it('passes the keyboard through when the stick is centred', async () => {
      const merged = mergeInputIntents(intent({ moveY: 1 }), NEUTRAL)
      expect(merged.moveY).toBe(1)
    })

    await it('lets touch steer when the stick is off centre', async () => {
      const merged = mergeInputIntents(NEUTRAL, intent({ moveX: 1 }))
      expect(merged.moveX).toBe(1)
    })

    await it('does not cancel opposing producers to a standstill', async () => {
      // The reason movement is a priority, not a sum: a held arrow key
      // and a thumb pushed the other way must still move the hero.
      const merged = mergeInputIntents(intent({ moveX: -1 }), intent({ moveX: 1 }))
      expect(merged.moveX).toBe(1)
    })

    await it('does not exceed unit speed when both producers push the same way', async () => {
      const merged = mergeInputIntents(intent({ moveX: 1 }), intent({ moveX: 1 }))
      expect(merged.moveX).toBe(1)
    })

    await it('ORs the action and attack buttons', async () => {
      expect(mergeInputIntents(intent({ actionHeld: true }), NEUTRAL).actionHeld).toBe(true)
      expect(mergeInputIntents(NEUTRAL, intent({ actionHeld: true })).actionHeld).toBe(true)
      expect(mergeInputIntents(intent({ attackHeld: true }), intent({ attackHeld: true })).attackHeld).toBe(true)
      expect(mergeInputIntents(NEUTRAL, NEUTRAL).attackHeld).toBe(false)
    })

    await it('keeps a touch button while the keyboard steers', async () => {
      // A player holding the on-screen A button with one thumb and an
      // arrow key with the other hand: both halves have to survive.
      const merged = mergeInputIntents(intent({ moveX: 1 }), intent({ actionHeld: true }))
      expect(merged.moveX).toBe(1)
      expect(merged.actionHeld).toBe(true)
    })
  })
}
