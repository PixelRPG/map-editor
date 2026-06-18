/**
 * Pure collaborators-bar roster builder behind `ApplicationWindow`'s
 * participant list. Pins the two correctness properties that are easy to
 * drift when this logic is moved off the window:
 *  - the local-AI dedup (a relayed peer carrying the assistant's peerId is
 *    skipped while the local assistant is already listed), and
 *  - the `isAI` flag, which keys on the peerId alone (so a relayed AI on a
 *    joiner, with no local assistant, is still flagged AI).
 */

import { describe, expect, it } from '@gjsify/unit'

import type { AwarenessPeerState } from '@pixelrpg/engine'

import { buildParticipantRoster } from './participant-roster.ts'

const AI = 'ai-assistant'

/** Minimal valid `AwarenessPeerState` for a roster input. */
function peer(peerId: string, displayName: string, color: string): AwarenessPeerState {
  return { peerId, info: { displayName, color }, cursor: null, selection: null, lastUpdate: 0 }
}

export default async () => {
  await describe('buildParticipantRoster', async () => {
    await it('returns an empty roster with no assistant and no peers', async () => {
      expect(buildParticipantRoster(null, [], AI)).toStrictEqual([])
    })

    await it('lists the local assistant alone, flagged isAI', async () => {
      expect(buildParticipantRoster({ name: 'AI Assistant', color: '#9141ac' }, [], AI)).toStrictEqual([
        { peerId: AI, name: 'AI Assistant', color: '#9141ac', isAI: true },
      ])
    })

    await it('lists human peers in order, none flagged isAI', async () => {
      expect(buildParticipantRoster(null, [peer('p1', 'Ada', '#fff'), peer('p2', 'Bo', '#000')], AI)).toStrictEqual([
        { peerId: 'p1', name: 'Ada', color: '#fff', isAI: false },
        { peerId: 'p2', name: 'Bo', color: '#000', isAI: false },
      ])
    })

    await it('dedups a relayed-AI peer when the local assistant is present', async () => {
      const roster = buildParticipantRoster(
        { name: 'AI Assistant', color: '#9141ac' },
        [peer(AI, 'AI Assistant', '#9141ac'), peer('p1', 'Ada', '#fff')],
        AI,
      )
      expect(roster).toStrictEqual([
        { peerId: AI, name: 'AI Assistant', color: '#9141ac', isAI: true },
        { peerId: 'p1', name: 'Ada', color: '#fff', isAI: false },
      ])
    })

    await it('flags a relayed-AI peer isAI on a joiner with no local assistant', async () => {
      expect(
        buildParticipantRoster(null, [peer('p1', 'Ada', '#fff'), peer(AI, 'AI Assistant', '#9141ac')], AI),
      ).toStrictEqual([
        { peerId: 'p1', name: 'Ada', color: '#fff', isAI: false },
        { peerId: AI, name: 'AI Assistant', color: '#9141ac', isAI: true },
      ])
    })

    await it('lists the assistant first when both are present', async () => {
      const roster = buildParticipantRoster({ name: 'AI', color: '#000' }, [peer('p1', 'Ada', '#fff')], AI)
      expect(roster[0]?.peerId).toBe(AI)
      expect(roster[1]?.peerId).toBe('p1')
    })
  })
}
