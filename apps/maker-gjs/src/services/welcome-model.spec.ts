import { describe, expect, it } from '@gjsify/unit'

import type { RecentProjectEntry } from './recent-projects.ts'
import { buildWelcomeRecents, captionDuplicateNames, folderLabel, normaliseJoinCode } from './welcome-model.ts'

function entry(overrides: Partial<RecentProjectEntry> & { name: string }): RecentProjectEntry {
  return {
    path: `/home/p/games/${overrides.name}/game-project.json`,
    caption: 'a description',
    openedAt: 1_000,
    missing: false,
    ...overrides,
  }
}

export default async () => {
  await describe('buildWelcomeRecents', async () => {
    await it('has no Continue card without recents', async () => {
      const built = buildWelcomeRecents([], 4)
      expect(built.continueProject).toBeNull()
      expect(built.rows.length).toBe(0)
      expect(built.missingCount).toBe(0)
    })

    await it('promotes the newest present entry and never repeats it below', async () => {
      const built = buildWelcomeRecents([entry({ name: 'alpha' }), entry({ name: 'beta' })], 4)
      expect(built.continueProject?.name).toBe('alpha')
      expect(built.rows.length).toBe(1)
      expect(built.rows[0].name).toBe('beta')
    })

    await it('skips missing entries and counts them for the Tidy-up row', async () => {
      const built = buildWelcomeRecents(
        [entry({ name: 'gone', missing: true }), entry({ name: 'alpha' }), entry({ name: 'lost', missing: true })],
        4,
      )
      expect(built.continueProject?.name).toBe('alpha')
      expect(built.rows.length).toBe(0)
      expect(built.missingCount).toBe(2)
    })

    await it('caps the rows below the card at maxRows', async () => {
      const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      const built = buildWelcomeRecents(
        names.map((name) => entry({ name })),
        4,
      )
      expect(built.continueProject?.name).toBe('a')
      expect(built.rows.length).toBe(4)
      expect(built.rows[3].name).toBe('e')
    })

    await it('treats a zero or negative cap as no rows', async () => {
      const built = buildWelcomeRecents([entry({ name: 'a' }), entry({ name: 'b' })], 0)
      expect(built.continueProject?.name).toBe('a')
      expect(built.rows.length).toBe(0)
    })
  })

  await describe('captionDuplicateNames', async () => {
    await it('keeps the description when every name is unique', async () => {
      const [first] = captionDuplicateNames([entry({ name: 'alpha' })])
      expect(first.caption).toBe('a description')
    })

    await it('captions same-named projects with their folder', async () => {
      const captioned = captionDuplicateNames([
        entry({ name: 'Forest', path: '/home/p/work/forest-old/game-project.json' }),
        entry({ name: 'Forest', path: '/home/p/work/forest-new/game-project.json' }),
        entry({ name: 'Cave', path: '/home/p/work/cave/game-project.json' }),
      ])
      expect(captioned[0].caption).toBe('forest-old')
      expect(captioned[1].caption).toBe('forest-new')
      expect(captioned[2].caption).toBe('a description')
    })

    await it('does not mutate its input', async () => {
      const input = [
        entry({ name: 'Forest', path: '/a/one/game-project.json' }),
        entry({ name: 'Forest', path: '/a/two/game-project.json' }),
      ]
      captionDuplicateNames(input)
      expect(input[0].caption).toBe('a description')
    })
  })

  await describe('folderLabel', async () => {
    await it('names the directory holding the project file', async () => {
      expect(folderLabel('/home/p/games/kokiri/game-project.json')).toBe('kokiri')
    })

    await it('falls back to the whole path without a parent segment', async () => {
      expect(folderLabel('game-project.json')).toBe('game-project.json')
    })
  })

  await describe('normaliseJoinCode', async () => {
    await it('accepts a bare code', async () => {
      expect(normaliseJoinCode('abc123')).toBe('abc123')
      expect(normaliseJoinCode('  room-7_B  ')).toBe('room-7_B')
    })

    await it('accepts a full pixelrpg join URL', async () => {
      expect(normaliseJoinCode('pixelrpg://join/room-42')).toBe('room-42')
    })

    await it('strips the punctuation a paste drags along', async () => {
      expect(normaliseJoinCode('<abc123>')).toBe('abc123')
    })

    await it('rejects empty and unusable input', async () => {
      expect(normaliseJoinCode('')).toBeNull()
      expect(normaliseJoinCode('   ')).toBeNull()
      expect(normaliseJoinCode('has spaces')).toBeNull()
      expect(normaliseJoinCode('pixelrpg://host/room-42')).toBeNull()
    })
  })
}
