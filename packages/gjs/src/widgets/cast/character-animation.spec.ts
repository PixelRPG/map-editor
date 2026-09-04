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
    })
  })
}
