import { describe, expect, it } from '@gjsify/unit'

import { colourForPeer, PEER_COLOURS } from './collab-peer-colour.ts'

export default async () => {
  await describe('colourForPeer', async () => {
    await it('always lands inside the palette', async () => {
      for (const id of ['', 'a', 'peer-abc123def456', 'ZZZ', '🙂']) {
        expect((PEER_COLOURS as readonly string[]).includes(colourForPeer(id))).toBe(true)
      }
    })

    await it('is stable for the same peer id', async () => {
      // Load-bearing: every participant derives a peer's colour locally,
      // so an unstable hash would paint the same cursor differently on
      // each side of the session.
      expect(colourForPeer('peer-xyz')).toBe(colourForPeer('peer-xyz'))
    })

    await it('does not include the AI assistant purple', async () => {
      expect((PEER_COLOURS as readonly string[]).includes('#9141ac')).toBe(false)
    })

    await it('spreads realistic peer ids across the palette', async () => {
      const seen = new Set<string>()
      for (let i = 0; i < 64; i++) seen.add(colourForPeer(`peer-${i.toString(36)}00000000`))
      expect(seen.size).toBeGreaterThan(1)
    })
  })
}
