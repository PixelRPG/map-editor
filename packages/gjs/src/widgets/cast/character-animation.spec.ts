import { describe, expect, it } from '@gjsify/unit'

import { animationIdFor, nextDirection, parseAnimationRole, resolveAnimation } from './character-animation.ts'

const ANIMS = [{ id: 'walk-down' }, { id: 'idle-left' }, { id: 'sword-swing' }]

export default async () => {
  await describe('character-animation', async () => {
    await describe('parseAnimationRole', async () => {
      await it('splits a required-role id', async () => {
        expect(parseAnimationRole('idle-left')).toStrictEqual({ kind: 'idle', direction: 'left' })
      })

      await it('rejects a custom id', async () => {
        expect(parseAnimationRole('sword-swing')).toBe(null)
      })

      await it('rejects an unknown direction', async () => {
        expect(parseAnimationRole('walk-sideways')).toBe(null)
      })

      await it('rejects an empty id', async () => {
        expect(parseAnimationRole('')).toBe(null)
      })

      await it('is anchored — a role id with a suffix is custom', async () => {
        expect(parseAnimationRole('walk-up-fast')).toBe(null)
      })

      await it('is anchored at the front too', async () => {
        expect(parseAnimationRole('slow-walk-up')).toBe(null)
      })

      await it('is case-sensitive', async () => {
        expect(parseAnimationRole('Walk-Up')).toBe(null)
      })

      await it('round-trips with animationIdFor for every facing', async () => {
        for (const direction of ['up', 'down', 'left', 'right'] as const) {
          expect(parseAnimationRole(animationIdFor(direction, true))).toStrictEqual({ kind: 'idle', direction })
          expect(parseAnimationRole(animationIdFor(direction, false))).toStrictEqual({ kind: 'walk', direction })
        }
      })
    })

    await describe('animationIdFor', async () => {
      await it('uses walk while unpaused', async () => {
        expect(animationIdFor('up', false)).toBe('walk-up')
      })

      await it('uses idle while paused', async () => {
        expect(animationIdFor('up', true)).toBe('idle-up')
      })
    })

    await describe('nextDirection', async () => {
      await it('rotates down → left → up → right', async () => {
        expect(nextDirection('down')).toBe('left')
        expect(nextDirection('left')).toBe('up')
        expect(nextDirection('up')).toBe('right')
      })

      await it('wraps back to the start', async () => {
        expect(nextDirection('right')).toBe('down')
      })

      await it('returns to the start after exactly four steps', async () => {
        let direction: ReturnType<typeof nextDirection> = 'down'
        for (let i = 0; i < 4; i++) direction = nextDirection(direction)
        expect(direction).toBe('down')
      })
    })

    await describe('resolveAnimation', async () => {
      await it('matches the exact role first', async () => {
        expect(resolveAnimation(ANIMS, null, 'down', false)?.id).toBe('walk-down')
      })

      await it('falls back across kinds when the role is missing', async () => {
        expect(resolveAnimation(ANIMS, null, 'left', false)?.id).toBe('idle-left')
      })

      await it('returns null when neither kind exists for the facing', async () => {
        expect(resolveAnimation(ANIMS, null, 'right', false)).toBe(null)
      })

      await it('selects a custom animation by id', async () => {
        expect(resolveAnimation(ANIMS, 'sword-swing', 'down', false)?.id).toBe('sword-swing')
      })

      await it('returns null for a custom id that no longer exists', async () => {
        expect(resolveAnimation(ANIMS, 'gone', 'down', false)).toBe(null)
      })

      await it('returns null for an empty animation list', async () => {
        expect(resolveAnimation([], null, 'down', false)).toBe(null)
        expect(resolveAnimation([], 'anything', 'down', false)).toBe(null)
      })

      await it('falls back from idle to walk as well as the other way', async () => {
        expect(resolveAnimation(ANIMS, null, 'down', true)?.id).toBe('walk-down')
      })

      await it('prefers the exact role even when the fallback comes first', async () => {
        const reordered = [{ id: 'idle-down' }, { id: 'walk-down' }]
        expect(resolveAnimation(reordered, null, 'down', false)?.id).toBe('walk-down')
        expect(resolveAnimation(reordered, null, 'down', true)?.id).toBe('idle-down')
      })

      await it('takes the FIRST match on a duplicated id', async () => {
        const duplicated = [
          { id: 'walk-up', tag: 1 },
          { id: 'walk-up', tag: 2 },
        ]
        expect(resolveAnimation(duplicated, null, 'up', false)?.tag).toBe(1)
      })

      await it('an empty custom id is still a lookup, not a role fallback', async () => {
        // `''` is not null, so it selects by id — and finds nothing.
        expect(resolveAnimation(ANIMS, '', 'down', false)).toBe(null)
      })
    })
  })
}
