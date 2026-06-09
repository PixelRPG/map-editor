import { describe, expect, it } from '@gjsify/unit'
import * as Commands from './index.ts'
import { PlaceObjectCommand, RemoveObjectCommand } from './object-placement.command.ts'
import { EraseTileCommand, PaintTileCommand } from './paint-tile.command.ts'
import { BUILT_IN_COMMANDS } from './registry.ts'

/**
 * Auto-discover every shipped Command class from the package barrel: a
 * Command class is a constructor carrying a static string `KIND`. Because
 * `check:barrels` guarantees the barrel re-exports every `*.command.ts`,
 * this finds every command in the codebase without a hand-maintained list.
 */
function discoverCommandKinds(): string[] {
  return (Object.values(Commands) as unknown[])
    .filter(
      (value): value is { KIND: string } =>
        typeof value === 'function' && typeof (value as { KIND?: unknown }).KIND === 'string',
    )
    .map((commandClass) => commandClass.KIND)
}

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

    await it('roundtrips object place / remove kinds → instances', async () => {
      const placement = { id: 'p1', layerId: 'l1', tileX: 2, tileY: 3, defId: 'apple' }
      const place = BUILT_IN_COMMANDS[PlaceObjectCommand.KIND]?.({ placement })
      expect(place).toBeInstanceOf(PlaceObjectCommand)
      expect(place?.kind).toBe('object.place')
      const remove = BUILT_IN_COMMANDS[RemoveObjectCommand.KIND]?.({ placement })
      expect(remove).toBeInstanceOf(RemoveObjectCommand)
      expect(remove?.kind).toBe('object.remove')
    })

    await it('every shipped Command class is registered in BUILT_IN_COMMANDS', async () => {
      // Auto-enforced collab contract: a Command applies locally even when
      // unregistered, but a remote peer can't reconstruct it from the wire
      // — so an unregistered command works solo and silently desyncs in
      // collab. Adding a `*.command.ts` without a registry entry fails here.
      const discovered = discoverCommandKinds()
      expect(discovered.length).toBeGreaterThan(0)
      for (const kind of discovered) {
        expect(BUILT_IN_COMMANDS[kind]).toBeDefined()
      }
      // And no stale registry entries without a backing class.
      for (const kind of Object.keys(BUILT_IN_COMMANDS)) {
        expect(discovered).toContain(kind)
      }
    })
  })
}
