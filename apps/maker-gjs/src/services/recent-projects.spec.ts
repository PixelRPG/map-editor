import { describe, expect, it } from '@gjsify/unit'

import { markMissingRecents, parseRecentProjects, type RecentProject } from './recent-projects.ts'

const recent = (path: string, overrides: Partial<RecentProject> = {}): RecentProject => ({
  path,
  name: path.split('/').pop() ?? path,
  caption: '',
  openedAt: 1_700_000_000_000,
  ...overrides,
})

export default async () => {
  await describe('parseRecentProjects', async () => {
    await it('keeps well-formed entries in order', async () => {
      const entries = parseRecentProjects(
        JSON.stringify([recent('/a/game-project.json'), recent('/b/game-project.json')]),
      )
      expect(entries.map((e) => e.path)).toStrictEqual(['/a/game-project.json', '/b/game-project.json'])
    })

    await it('drops entries missing a path or a name', async () => {
      const entries = parseRecentProjects(
        JSON.stringify([{ path: '/a/game-project.json' }, { name: 'nameless' }, null, recent('/c/game-project.json')]),
      )
      expect(entries.map((e) => e.path)).toStrictEqual(['/c/game-project.json'])
    })

    await it('caps the list at eight entries', async () => {
      const many = Array.from({ length: 12 }, (_, i) => recent(`/p${i}/game-project.json`))
      expect(parseRecentProjects(JSON.stringify(many))).toHaveLength(8)
    })

    await it('yields nothing for malformed or non-array JSON', async () => {
      expect(parseRecentProjects('not json')).toStrictEqual([])
      expect(parseRecentProjects('{"recents":[]}')).toStrictEqual([])
    })
  })

  await describe('markMissingRecents', async () => {
    await it('flags every entry whose project file is gone', async () => {
      // The welcome view used to fire a MapPreview load per entry and log
      // a full FetchError stack trace for each vanished one — five for a
      // moved checkout, on every visit. Nothing checked first; this is
      // the check.
      const entries = markMissingRecents(
        [recent('/here/game-project.json'), recent('/moved/game-project.json')],
        (path) => path === '/here/game-project.json',
      )
      expect(entries.map((e) => e.missing)).toStrictEqual([false, true])
    })

    await it('keeps missing entries in the list rather than dropping them', async () => {
      // Deliberate: the path may be an unmounted drive. A greyed-out row
      // is recoverable, a deleted bookmark is not.
      const entries = markMissingRecents([recent('/gone/game-project.json')], () => false)
      expect(entries).toHaveLength(1)
      expect(entries[0].path).toBe('/gone/game-project.json')
    })

    await it('carries the stored fields through untouched', async () => {
      const [entry] = markMissingRecents(
        [recent('/a/game-project.json', { caption: 'A demo', sceneCount: 3 })],
        () => true,
      )
      expect(entry.caption).toBe('A demo')
      expect(entry.sceneCount).toBe(3)
      expect(entry.missing).toBe(false)
    })
  })
}
