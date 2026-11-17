import type { CollaboratorEntry } from '@pixelrpg/gjs'
import { describe, expect, it } from '@gjsify/unit'

import { buildTogetherPresentation, hasInviteCode, type TogetherInput, togetherMode } from './together-model.ts'

const SELF = 'peer-self'
const MIA = 'peer-mia'
const AI = 'assistant'

function input(overrides: Partial<TogetherInput> = {}): TogetherInput {
  return {
    session: { kind: 'idle' },
    projectName: 'Zelda-like',
    selfPeerId: SELF,
    selfName: 'You',
    selfColor: '#3584e4',
    participants: [],
    followedPeerId: null,
    locations: new Map(),
    shareUrlFor: (roomId) => `pixelrpg://join/${roomId}`,
    ...overrides,
  }
}

function peer(peerId: string, name: string, isAI = false): CollaboratorEntry {
  return { peerId, name, color: '#33d17a', isAI }
}

export default async () => {
  await describe('togetherMode', async () => {
    await it('is solo for the pre-session kinds', async () => {
      expect(togetherMode('idle', undefined)).toBe('solo')
      expect(togetherMode('browsing', undefined)).toBe('solo')
    })

    await it('is sharing while hosting, even before a peer arrives', async () => {
      expect(togetherMode('hosting', undefined)).toBe('sharing')
    })

    await it('is starting while a join negotiates', async () => {
      expect(togetherMode('connecting', undefined)).toBe('starting')
    })

    await it('splits connected by role', async () => {
      expect(togetherMode('connected', 'host')).toBe('sharing')
      expect(togetherMode('connected', 'joiner')).toBe('joined')
    })

    await it('treats a host awaiting an engine as already sharing', async () => {
      expect(togetherMode('awaiting-engine', 'host')).toBe('sharing')
      expect(togetherMode('awaiting-engine', 'joiner')).toBe('joined')
    })

    await it('falls back to solo for a kind it has never heard of', async () => {
      expect(togetherMode('some-future-kind', undefined)).toBe('solo')
    })
  })

  await describe('hasInviteCode', async () => {
    await it('is true exactly where a code exists', async () => {
      expect(hasInviteCode('sharing')).toBe(true)
      expect(hasInviteCode('joined')).toBe(true)
      expect(hasInviteCode('solo')).toBe(false)
      expect(hasInviteCode('starting')).toBe(false)
    })
  })

  await describe('buildTogetherPresentation', async () => {
    await it('lists the local user first, alone, when solo', async () => {
      const view = buildTogetherPresentation(input({ selfName: 'Mia' }))
      expect(view.mode).toBe('solo')
      expect(view.people.length).toBe(1)
      expect(view.people[0].name).toBe('Mia')
      expect(view.people[0].isSelf).toBe(true)
    })

    await it('never marks the local row followable, even when it is the followed id', async () => {
      const view = buildTogetherPresentation(input({ followedPeerId: SELF }))
      expect(view.people[0].following).toBe(false)
    })

    await it('shows no code while solo even if a stale roomId is around', async () => {
      const view = buildTogetherPresentation(input({ session: { kind: 'idle', roomId: 'old-room' } }))
      expect(view.code).toBe(null)
      expect(view.shareUrl).toBe(null)
    })

    await it('builds the share url from the room id while hosting', async () => {
      const view = buildTogetherPresentation(input({ session: { kind: 'hosting', roomId: 'abc123' } }))
      expect(view.code).toBe('abc123')
      expect(view.shareUrl).toBe('pixelrpg://join/abc123')
    })

    await it('keeps the roster order after self: the AI, then peers', async () => {
      const view = buildTogetherPresentation(input({ participants: [peer(AI, 'Assistant', true), peer(MIA, 'Mia')] }))
      expect(view.people.map((p) => p.peerId)).toStrictEqual([SELF, AI, MIA])
      expect(view.people[1].isAI).toBe(true)
    })

    await it('drops a relayed frame of our own presence instead of listing us twice', async () => {
      const view = buildTogetherPresentation(input({ participants: [peer(SELF, 'You (relayed)'), peer(MIA, 'Mia')] }))
      expect(view.people.map((p) => p.peerId)).toStrictEqual([SELF, MIA])
      expect(view.people[0].name).toBe('You')
    })

    await it('marks the followed peer', async () => {
      const view = buildTogetherPresentation(input({ participants: [peer(MIA, 'Mia')], followedPeerId: MIA }))
      expect(view.people[1].following).toBe(true)
    })

    await it('attaches each location, leaving an absent one null', async () => {
      const view = buildTogetherPresentation(
        input({
          participants: [peer(MIA, 'Mia')],
          locations: new Map([[MIA, 'Kokiri Forest']]),
        }),
      )
      expect(view.people[0].location).toBe(null)
      expect(view.people[1].location).toBe('Kokiri Forest')
    })
  })
}
