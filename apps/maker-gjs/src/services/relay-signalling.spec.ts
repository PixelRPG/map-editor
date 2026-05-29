import { describe, expect, it } from '@gjsify/unit'

import { defaultRelayUrl, generateRoomId } from './relay-signalling.ts'

export default async () => {
  await describe('generateRoomId', async () => {
    await it('returns an 8-character id from the unambiguous alphabet', async () => {
      const id = generateRoomId()
      expect(id).toHaveLength(8)
      expect(id).toMatch(/^[abcdefghijkmnpqrstuvwxyz23456789]{8}$/)
    })

    await it('returns distinct ids on consecutive calls (collision unlikely at 2.8e12)', async () => {
      const ids = new Set<string>()
      for (let i = 0; i < 50; i++) ids.add(generateRoomId())
      expect(ids.size).toBe(50)
    })
  })

  await describe('defaultRelayUrl', async () => {
    await it('reads PIXELRPG_RELAY_URL when set', async () => {
      const prev = process.env.PIXELRPG_RELAY_URL
      process.env.PIXELRPG_RELAY_URL = 'wss://custom.example/sig'
      try {
        expect(defaultRelayUrl()).toBe('wss://custom.example/sig')
      } finally {
        if (prev === undefined) delete process.env.PIXELRPG_RELAY_URL
        else process.env.PIXELRPG_RELAY_URL = prev
      }
    })

    await it('falls back to the hosted endpoint when env is unset', async () => {
      const prev = process.env.PIXELRPG_RELAY_URL
      delete process.env.PIXELRPG_RELAY_URL
      try {
        expect(defaultRelayUrl()).toMatch(/^wss?:\/\//)
      } finally {
        if (prev !== undefined) process.env.PIXELRPG_RELAY_URL = prev
      }
    })
  })
}
