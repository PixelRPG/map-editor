/**
 * Directional animations are one motion, so every direction of an action
 * must run at the same pace. `link.json` once gave `walk-left` 130 ms frames
 * while the other three walk directions used 200 ms — the hero visibly
 * sped up when turning left. This loads every `kind: character` sprite-set
 * shipped under games/<id>/spritesets/ and pins the invariant: all directions
 * of one action share a frame count and a total duration.
 */

import { describe, expect, it } from '@gjsify/unit'

import starterScientist from '../../../../games/blank-starter/spritesets/scientist.json' with { type: 'json' }
import link from '../../../../games/zelda-like/spritesets/link.json' with { type: 'json' }
import zeldaScientist from '../../../../games/zelda-like/spritesets/scientist.json' with { type: 'json' }

const DIRECTIONS = ['up', 'down', 'left', 'right'] as const
/** Every `kind: character` sprite-set under games/<id>/spritesets/. */
const CHARACTER_SETS = [link, zeldaScientist, starterScientist]

interface Motion {
  frames: number
  duration: number
}

/** `walk-left` → `walk`; an id without a direction suffix is its own action. */
function actionOf(id: string): string {
  for (const direction of DIRECTIONS) {
    const suffix = `-${direction}`
    if (id.endsWith(suffix)) return id.slice(0, -suffix.length)
  }
  return id
}

function motionOf(animation: { frames: readonly { duration: number }[] }): Motion {
  return {
    frames: animation.frames.length,
    duration: animation.frames.reduce((total, frame) => total + frame.duration, 0),
  }
}

export default async () => {
  await describe('character animation directions agree', async () => {
    for (const spriteSet of CHARACTER_SETS) {
      await it(`${spriteSet.id}: each action's directions share frame count and total duration`, async () => {
        expect(spriteSet.kind).toBe('character')
        const byAction = new Map<string, Map<string, Motion>>()
        for (const animation of spriteSet.characterAnimations) {
          const action = actionOf(animation.id)
          const variants = byAction.get(action) ?? new Map<string, Motion>()
          variants.set(animation.id, motionOf(animation))
          byAction.set(action, variants)
        }
        expect(byAction.size).toBeGreaterThan(0)
        for (const [action, variants] of byAction) {
          // All four directions must be present — a missing one would make
          // the equality checks below pass trivially.
          expect([...variants.keys()].sort()).toStrictEqual(DIRECTIONS.map((d) => `${action}-${d}`).sort())
          const [first, ...rest] = [...variants.values()]
          for (const variant of rest) {
            expect(variant.frames).toBe(first.frames)
            expect(variant.duration).toBe(first.duration)
          }
        }
      })
    }
  })
}
