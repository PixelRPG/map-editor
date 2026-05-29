import { describe, expect, it } from '@gjsify/unit'

import { BUILT_IN_COMMANDS } from './registry.ts'
import { EraseTileCommand, PaintTileCommand } from './paint-tile.command.ts'

export default async () => {
  await describe('BUILT_IN_COMMANDS registry', async () => {
    await it('roundtrips a PaintTileCommand kind → instance', async () => {
      const factory = BUILT_IN_COMMANDS[PaintTileCommand.KIND]
      expect(factory).toBeDefined()
      const cmd = factory!({
        tileX: 3,
        tileY: 5,
        layerId: 'ground',
        spriteId: 12,
        previousSprites: [],
      })
      expect(cmd).toBeInstanceOf(PaintTileCommand)
      expect(cmd.kind).toBe(PaintTileCommand.KIND)
    })

    await it('roundtrips an EraseTileCommand kind → instance', async () => {
      const factory = BUILT_IN_COMMANDS[EraseTileCommand.KIND]
      expect(factory).toBeDefined()
      const cmd = factory!({
        tileX: 0,
        tileY: 0,
        layerId: 'ground',
        previousSprites: [],
      })
      expect(cmd).toBeInstanceOf(EraseTileCommand)
      expect(cmd.kind).toBe(EraseTileCommand.KIND)
    })

    await it('covers every shipped Command class — adding one without a registry entry breaks this test', async () => {
      expect(Object.keys(BUILT_IN_COMMANDS).sort()).toStrictEqual([EraseTileCommand.KIND, PaintTileCommand.KIND].sort())
    })
  })
}
