import { describe, expect, it } from '@gjsify/unit'
import { type CharacterAnimation, REQUIRED_ROLES } from '@pixelrpg/engine'

import {
  appendAnimation,
  isProtectedAnimation,
  removeAnimation,
  replaceAnimation,
  retimeAnimation,
} from './cast-controller-animations.ts'

function anim(id: string, durations: number[] = [100]): CharacterAnimation {
  return { id, frames: durations.map((duration, i) => ({ spriteId: i, duration })) }
}

export default async () => {
  await describe('isProtectedAnimation', async () => {
    await it('protects every required role', async () => {
      expect(REQUIRED_ROLES.every((role) => isProtectedAnimation(role))).toBe(true)
    })

    await it('leaves custom animations deletable', async () => {
      expect(isProtectedAnimation('victory-dance')).toBe(false)
    })
  })

  await describe('appendAnimation', async () => {
    await it('appends a valid animation', async () => {
      const next = appendAnimation([anim('a')], anim('b'))
      expect(next?.map((x) => x.id)).toStrictEqual(['a', 'b'])
    })

    await it('rejects an empty frame list', async () => {
      expect(appendAnimation([anim('a')], anim('b', []))).toBeNull()
    })

    await it('rejects a duplicate id', async () => {
      expect(appendAnimation([anim('a')], anim('a'))).toBeNull()
    })

    await it('does not mutate the input list', async () => {
      const anims = [anim('a')]
      appendAnimation(anims, anim('b'))
      expect(anims).toHaveLength(1)
    })
  })

  await describe('replaceAnimation', async () => {
    await it('replaces in place, preserving order', async () => {
      const next = replaceAnimation([anim('a'), anim('b'), anim('c')], 'b', anim('b', [40]))
      expect(next?.map((x) => x.id)).toStrictEqual(['a', 'b', 'c'])
      expect(next?.[1].frames[0].duration).toBe(40)
    })

    await it('renames in place when the new id is free', async () => {
      const next = replaceAnimation([anim('a'), anim('b')], 'b', anim('z'))
      expect(next?.map((x) => x.id)).toStrictEqual(['a', 'z'])
    })

    await it('rejects a rename that would collide with another entry', async () => {
      // Two animations sharing an id would make the sheet ambiguous for
      // every character using it — and the merge would replicate.
      expect(replaceAnimation([anim('a'), anim('b')], 'b', anim('a'))).toBeNull()
    })

    await it('treats a lost original as an add so the frames are not dropped', async () => {
      // The original can vanish between opening the editor and saving —
      // another session, or a peer's delete arriving over the op channel.
      const next = replaceAnimation([anim('a')], 'gone', anim('b'))
      expect(next?.map((x) => x.id)).toStrictEqual(['a', 'b'])
    })

    await it('rejects a re-add whose id already exists', async () => {
      expect(replaceAnimation([anim('a')], 'gone', anim('a'))).toBeNull()
    })

    await it('rejects an empty frame list', async () => {
      expect(replaceAnimation([anim('a')], 'a', anim('a', []))).toBeNull()
    })
  })

  await describe('removeAnimation', async () => {
    await it('drops the matching entry', async () => {
      const next = removeAnimation([anim('a'), anim('b'), anim('c')], 'b')
      expect(next?.map((x) => x.id)).toStrictEqual(['a', 'c'])
    })

    await it('reports no change for an unknown id', async () => {
      expect(removeAnimation([anim('a')], 'nope')).toBeNull()
    })
  })

  await describe('retimeAnimation', async () => {
    await it('sets one uniform duration across every frame of one animation', async () => {
      const next = retimeAnimation([anim('a', [10, 20, 30]), anim('b', [99])], 'a', 50)
      expect(next?.[0].frames.map((f) => f.duration)).toStrictEqual([50, 50, 50])
      expect(next?.[1].frames.map((f) => f.duration)).toStrictEqual([99])
    })

    await it('reports no change for an unknown id', async () => {
      expect(retimeAnimation([anim('a')], 'nope', 50)).toBeNull()
    })

    await it('does not mutate the input frames', async () => {
      const anims = [anim('a', [10])]
      retimeAnimation(anims, 'a', 50)
      expect(anims[0].frames[0].duration).toBe(10)
    })
  })
}
