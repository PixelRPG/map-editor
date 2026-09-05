/**
 * Regression tests for the tile-editor system's collab-broadcast
 * contract.
 *
 * The system's `dispatchCommand` routes every paint / erase through
 * the shared `executeCommandOnScene` helper (apply + undo-stack push
 * + `EngineEvent.COMMAND_EXECUTED` emit) so the collab layer's
 * `SessionController` can relay the operation to peers.
 *
 * 2026-06-01 hand-test: an earlier INLINE copy of that body in this
 * system dropped the COMMAND_EXECUTED emit — a host that hosted a
 * session + painted tiles sent zero `op` frames on the WebRTC data
 * channel (only awareness frames); the joiner saw the initial
 * snapshot but no live edits. These tests pin the emit contract.
 */

import { describe, expect, it } from '@gjsify/unit'
import { type Entity, EventEmitter, type Scene, TileMap, Vector } from 'excalibur'

import type { Command, ObjectPlacementPayload } from '../commands/index.ts'
import { ActiveObjectComponent } from '../components/active-object.component.ts'
import { MapEditorComponent } from '../components/map-editor.component.ts'
import { TileMapPlaneComponent } from '../components/tilemap-plane.component.ts'
import { EditOperations } from '../engine/edit-operations.ts'
import type { EditorSession } from '../engine/editor-session.ts'
import type { LayerOperations } from '../engine/layer-operations.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { TileEditorSystem } from './tile-editor.system.ts'

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
    // not throw; the actual paint side-effect is exercised by
    // `commands/paint-tile.command.spec.ts`, not by this
    // regression test.
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

  await describe('TileEditorSystem.toTileCoords — bounds authority', async () => {
    /**
     * A scene whose PERSISTED extent is smaller than the tilemap it was
     * (supposedly) derived from. The mismatch never happens in practice
     * — `buildPlaneTileMaps` copies `columns`/`rows` verbatim, pinned by
     * `resource/bounds-derivation.spec.ts` — but it is the only way to
     * observe WHICH source the pointer path trusts.
     */
    function makeMismatchedScene(): { system: TileEditorSystem; tileMap: TileMap } {
      const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: 8, rows: 8 })
      const scene = {
        mapResource: { mapData: { columns: 4, rows: 4 } },
      } as unknown as MapScene
      const system = new TileEditorSystem(new EventEmitter<EngineEventMap>())
      ;(system as unknown as { scene: Scene }).scene = scene as unknown as Scene
      return { system, tileMap }
    }

    const coordsOf = (system: TileEditorSystem, tileMap: TileMap, world: Vector) =>
      (
        system as unknown as {
          toTileCoords(t: TileMap, w: Vector): { x: number; y: number } | null
        }
      ).toTileCoords(tileMap, world)

    await it('bounds-checks the pointer path against the PERSISTED map extent', async () => {
      // Same verdict `EditOperations.placeObject` gives for the same
      // tile — the two paths share `isTileOutsideMap` and the same
      // authority. They used to read different sources and agree only
      // by coincidence.
      const { system, tileMap } = makeMismatchedScene()
      expect(coordsOf(system, tileMap, new Vector(24, 24))).toStrictEqual({ x: 1, y: 1 })
      expect(coordsOf(system, tileMap, new Vector(88, 24))).toBe(null)
    })

    await it('falls back to the tilemap when the scene carries no map data', async () => {
      const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: 8, rows: 8 })
      const system = new TileEditorSystem(new EventEmitter<EngineEventMap>())
      ;(system as unknown as { scene: Scene }).scene = {} as unknown as Scene
      expect(coordsOf(system, tileMap, new Vector(88, 24))).toStrictEqual({ x: 5, y: 1 })
      expect(coordsOf(system, tileMap, new Vector(200, 24))).toBe(null)
    })
  })

  await describe('object stamp — pointer path vs programmatic path', async () => {
    /**
     * The two object-stamp paths are the pair the round-2 audit flagged:
     * `TileEditorSystem.applyObjectStamp` (a click) and
     * `EditOperations.placeObject` (D-Bus/MCP). They build the same
     * command from the same tile, and they used to bounds-check against
     * different sources — agreeing only by coincidence. This drives BOTH
     * against one scene and compares the placements they produce, so a
     * divergence in either half fails here.
     */
    const LAYER = 'ground-layer'

    function makeScene(): MapScene {
      const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: 4, rows: 4 })
      tileMap.addComponent(new TileMapPlaneComponent('ground'))
      tileMap.addComponent(new MapEditorComponent())
      const mapResource = {
        mapData: {
          id: 'm1',
          columns: 4,
          rows: 4,
          layers: [{ id: LAYER, name: 'Ground', visible: true, plane: 'ground' }],
          objectPlacements: [],
        },
        getFirstLayerId: () => LAYER,
        // biome-ignore lint/suspicious/noExplicitAny: stub mirrors only what both paths read
      } as any as MapResource
      // `Scene.entities` is a prototype getter over
      // `world.entityManager.entities`, so `SessionState`'s singleton
      // lookup works as long as `add` pushes into that same array.
      const entities: Entity[] = [tileMap]
      const scene = Object.create(MapScene.prototype) as MapScene
      Object.assign(scene, {
        mapResource,
        entityLibrary: [{ id: 'npc', name: 'NPC' }],
        add(entity: Entity) {
          entities.push(entity)
        },
        world: { entityManager: { entities } },
      })
      // Arm the object brush the pointer stamp reads.
      SessionState.set(scene, new ActiveObjectComponent('npc'))
      return scene
    }

    function stampViaPointer(
      scene: MapScene,
      tileX: number,
      tileY: number,
    ): ObjectPlacementPayload['placement'] | null {
      const events = new EventEmitter<EngineEventMap>()
      const dispatched: Command[] = []
      const system = new TileEditorSystem(events)
      ;(system as unknown as { scene: Scene }).scene = scene as unknown as Scene
      ;(system as unknown as { dispatchCommand(c: Command): void }).dispatchCommand = (c) => {
        dispatched.push(c)
      }
      const tileMap = [...scene.world.entityManager.entities].find((e) => e instanceof TileMap) as TileMap
      const editor = tileMap.get(MapEditorComponent)
      ;(
        system as unknown as {
          applyObjectStamp(ctx: unknown): void
        }
      ).applyObjectStamp({
        scene,
        hit: { tileMap, tile: tileMap.getTile(tileX, tileY), coords: { x: tileX, y: tileY }, editor },
        layerId: LAYER,
        previousSprites: [],
        tileId: null,
      })
      const payload = dispatched[0]?.payload as ObjectPlacementPayload | undefined
      return payload?.placement ?? null
    }

    function stampProgrammatically(
      scene: MapScene,
      tileX: number,
      tileY: number,
    ): ObjectPlacementPayload['placement'] | null {
      const dispatched: Command[] = []
      const ops = new EditOperations({
        activeScene: () => scene,
        session: { activeLayer: LAYER, activeTile: null } as unknown as EditorSession,
        layers: { isLocked: () => false } as unknown as LayerOperations,
        assistant: { isPaused: () => false, isActive: () => false, flashTile: () => {} },
        execute: (command) => {
          dispatched.push(command)
        },
      })
      ops.placeObject({ defId: 'npc', layerId: null, tileX, tileY })
      const payload = dispatched[0]?.payload as ObjectPlacementPayload | undefined
      return payload?.placement ?? null
    }

    await it('both paths stamp the same layer, tile and definition', async () => {
      const pointer = stampViaPointer(makeScene(), 2, 3)
      const programmatic = stampProgrammatically(makeScene(), 2, 3)

      // Both must actually have produced a placement — a null-vs-null
      // comparison would pass while proving nothing.
      expect(pointer).not.toBe(null)
      expect(programmatic).not.toBe(null)
      expect(pointer?.layerId).toBe(programmatic?.layerId)
      expect(pointer?.tileX).toBe(programmatic?.tileX)
      expect(pointer?.tileY).toBe(programmatic?.tileY)
      expect(pointer?.defId).toBe(programmatic?.defId)
    })

    await it('neither path accepts a tile outside the persisted 4×4 extent', async () => {
      // Pointer path: the click never resolves to tile coords at all.
      const scene = makeScene()
      const tileMap = [...scene.world.entityManager.entities].find((e) => e instanceof TileMap) as TileMap
      const system = new TileEditorSystem(new EventEmitter<EngineEventMap>())
      ;(system as unknown as { scene: Scene }).scene = scene as unknown as Scene
      const coords = (
        system as unknown as { toTileCoords(t: TileMap, w: Vector): { x: number; y: number } | null }
      ).toTileCoords(tileMap, new Vector(72, 8))
      expect(coords).toBe(null)
      // Programmatic path: refused by the shared bounds predicate.
      expect(stampProgrammatically(makeScene(), 4, 0)).toBe(null)
    })
  })
}
