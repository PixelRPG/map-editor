/**
 * Regression tests for the tile-editor system's collab-broadcast
 * contract.
 *
 * The system's hot-path `dispatchCommand` applies a tile paint /
 * erase to the active scene INLINE (skipping `Engine.executeCommand`
 * to avoid the indirection on every click). It must mirror the
 * engine's emit of `EngineEvent.COMMAND_EXECUTED` afterwards so the
 * collab layer's `SessionController` can relay the paint to peers.
 *
 * 2026-06-01 hand-test: a host that hosted a session + painted tiles
 * sent zero `op` frames on the WebRTC data channel — only awareness
 * frames. The joiner saw the initial snapshot but no live edits.
 * Trace: `dispatchCommand` was missing the COMMAND_EXECUTED emit.
 */

import { describe, expect, it } from '@gjsify/unit'
import { Entity, EventEmitter, Scene } from 'excalibur'

import type { Command } from '../commands/index.ts'
import { TileEditorSystem } from './tile-editor.system.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'

/**
 * Minimal duck-typed scene sufficient for `SessionState`. We only
 * need an iterable `entities` collection plus a synchronous `add`
 * that pushes onto it — SessionState reads the singleton entity by
 * iterating + filtering by name. A full `new Scene()` from
 * Excalibur would require an engine context the test doesn't need.
 */
function makeFakeScene(): Scene {
  const entities: Entity[] = []
  return {
    entities,
    add(entity: Entity) {
      entities.push(entity)
    },
  } as unknown as Scene
}

function makeFakePaintCommand(): Command {
  return {
    kind: 'tile.paint',
    label: 'paint',
    payload: { tileMapId: 't', layerId: 'l', col: 1, row: 2, tile: 5 } as unknown,
    // No-op apply/revert — dispatchCommand only needs the call to
    // not throw; the actual paint side-effect is exercised by the
    // command's own spec, not by this regression test.
    apply: () => {},
    revert: () => {},
  } as unknown as Command
}

export default async () => {
  await describe('TileEditorSystem.dispatchCommand — collab broadcast', async () => {
    await it('emits COMMAND_EXECUTED so SessionController can relay the paint to peers', async () => {
      const events = new EventEmitter<EngineEventMap>()
      const broadcast: Command[] = []
      events.on(EngineEvent.COMMAND_EXECUTED, ({ command }) => broadcast.push(command))

      const system = new TileEditorSystem(events)
      // Inject scene directly — initialize() needs a real engine
      // + pointer wiring we don't care about for this contract test.
      ;(system as unknown as { scene: Scene }).scene = makeFakeScene()

      const cmd = makeFakePaintCommand()
      ;(system as unknown as { dispatchCommand(c: Command): void }).dispatchCommand(cmd)

      expect(broadcast.length).toBe(1)
      expect(broadcast[0]).toBe(cmd)
    })

    await it('does not emit when the system has no active scene (defensive no-op)', async () => {
      const events = new EventEmitter<EngineEventMap>()
      const broadcast: Command[] = []
      events.on(EngineEvent.COMMAND_EXECUTED, ({ command }) => broadcast.push(command))

      const system = new TileEditorSystem(events)
      // No scene assigned → dispatchCommand returns early.
      ;(system as unknown as { dispatchCommand(c: Command): void }).dispatchCommand(makeFakePaintCommand())

      expect(broadcast.length).toBe(0)
    })

    await it('emits exactly once per dispatch (not once per undo-stack branch)', async () => {
      // The two branches of dispatchCommand ("first command" vs
      // "stack already exists") run after the apply but before the
      // emit. Verify both branches end with exactly one emit.
      const events = new EventEmitter<EngineEventMap>()
      const broadcast: Command[] = []
      events.on(EngineEvent.COMMAND_EXECUTED, ({ command }) => broadcast.push(command))

      const system = new TileEditorSystem(events)
      ;(system as unknown as { scene: Scene }).scene = makeFakeScene()

      ;(system as unknown as { dispatchCommand(c: Command): void }).dispatchCommand(makeFakePaintCommand())
      ;(system as unknown as { dispatchCommand(c: Command): void }).dispatchCommand(makeFakePaintCommand())

      expect(broadcast.length).toBe(2)
    })
  })
}
