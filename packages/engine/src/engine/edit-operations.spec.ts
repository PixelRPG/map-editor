/**
 * The mutating-entry-point contract of {@link EditOperations}.
 *
 * Why this file exists: three of the four programmatic mutations ran
 * the shared guard chain and the fourth silently did not.
 * `removeObject` checked only "does the scene exist" and "is the
 * placement there", so a padlocked layer protected its tiles and
 * refused new placements while its existing objects stayed deletable —
 * and the deletion rode the op-log to peers who had set that same
 * padlock. Nothing detected that for as long as it existed, because
 * `EditOperations` had no spec at all.
 *
 * So this spec asserts the SHAPE of the guard chain, not one bug:
 *
 *  1. {@link CONTRACT} must list every public method on the class —
 *     enumerated off the prototype, so a fifth mutating operation fails
 *     here until someone writes down which gates it runs.
 *  2. Every listed operation must refuse a LOCKED target layer. There
 *     is no opt-out; the lock protects the layer, not the caller.
 *  3. Every listed operation must honour the assistant-pause gate
 *     UNLESS it declares `assistantPause: 'skip'` — which pins the one
 *     deliberate exception in place, so it cannot be "fixed" away
 *     either.
 */

import { describe, expect, it } from '@gjsify/unit'
import { TileMap } from 'excalibur'

import { type Command, PlaceObjectCommand } from '../commands/index.ts'
import { MapEditorComponent } from '../components/map-editor.component.ts'
import { TileMapPlaneComponent } from '../components/tilemap-plane.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import type { LayerPlane, ObjectPlacement } from '../types/data/index.ts'
import { EditOperations } from './edit-operations.ts'
import type { EditorSession } from './editor-session.ts'
import type { LayerOperations } from './layer-operations.ts'

/** The layer both the active-layer ops and the fixture placement live on. */
const TARGET_LAYER = 'ground-layer'
/** A second, unrelated layer — locking it must block nothing. */
const OTHER_LAYER = 'hero-layer'
const PLACEMENT_ID = 'placement-1'

interface Harness {
  ops: EditOperations
  scene: MapScene
  executed: Command[]
  lockChecks: string[]
}

interface HarnessOptions {
  /** Layers reported as padlocked. */
  locked?: string[]
  /** Whether the human has the AI collaborator paused. */
  paused?: boolean
}

function makeFakeSprite(): { clone: () => unknown } {
  return { clone: () => ({}) }
}

/**
 * A duck-typed `MapScene` (via `Object.create`, so `instanceof MapScene`
 * holds without the constructor's engine wiring) with one real `TileMap`
 * per plane, one object placement on {@link TARGET_LAYER}, and a sprite
 * set whose global tile id 1 is paintable.
 */
function makeScene(): MapScene {
  const spriteSet = {
    sprites: { 0: makeFakeSprite(), 1: makeFakeSprite() },
    animations: {},
    // One terrain, so `paintTerrain` has a brush to resolve. A table
    // with only the filled-centre entry is enough: nearest match
    // answers every other mask with it.
    data: { terrains: [{ id: 'grass', name: 'Grass', tiles: { '255': 0 } }] },
  }
  const mapResource = {
    mapData: {
      id: 'map-1',
      columns: 4,
      rows: 4,
      layers: [
        { id: TARGET_LAYER, name: 'Ground', visible: true, plane: 'ground' },
        { id: OTHER_LAYER, name: 'Decor', visible: true, plane: 'hero' },
      ],
      spriteSets: [{ id: 'terrain', firstGid: 1 }],
      objectPlacements: [{ id: PLACEMENT_ID, layerId: TARGET_LAYER, tileX: 1, tileY: 1, defId: 'npc' }],
    },
    getSpriteSetResource: () => spriteSet,
    getAllSpriteSetResources: () => new Map([['terrain', spriteSet]]),
    refreshTileSolidFromEditor: () => {},
    // biome-ignore lint/suspicious/noExplicitAny: stub mirrors only the surface these operations touch
  } as any as MapResource

  const makePlaneTileMap = (plane: LayerPlane): TileMap => {
    const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: 4, rows: 4 })
    tileMap.addComponent(new TileMapPlaneComponent(plane))
    tileMap.addComponent(new MapEditorComponent())
    return tileMap
  }

  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, {
    mapResource,
    entityLibrary: [{ id: 'npc', name: 'NPC' }],
    world: { entityManager: { entities: [makePlaneTileMap('ground'), makePlaneTileMap('hero')] } },
  })
  return scene
}

function makeHarness(options: HarnessOptions = {}): Harness {
  const locked = new Set(options.locked ?? [])
  const executed: Command[] = []
  const lockChecks: string[] = []
  const scene = makeScene()
  const ops = new EditOperations({
    activeScene: () => scene,
    session: { activeLayer: TARGET_LAYER, activeTile: 1 } as unknown as EditorSession,
    layers: {
      isLocked: (layerId: string) => {
        lockChecks.push(layerId)
        return locked.has(layerId)
      },
    } as unknown as LayerOperations,
    assistant: {
      isPaused: () => options.paused === true,
      isActive: () => false,
      flashTile: () => {},
    },
    execute: (command: Command) => {
      executed.push(command)
    },
  })
  return { ops, scene, executed, lockChecks }
}

/** The placements the fixture scene currently holds. */
function placementsOf(scene: MapScene): ObjectPlacement[] {
  return scene.mapResource.mapData?.objectPlacements ?? []
}

/**
 * An inert `MapScene` for replaying a produced command's apply/revert.
 *
 * {@link makeScene}'s fixture carries a real entity library, so
 * `spawnPlacement` would try to build an actor out of a definition that
 * has no components. Here the EMPTY library makes spawn resolve to
 * nothing and despawn iterate an empty world, leaving exactly the
 * `mapData.objectPlacements` round-trip these tests assert on.
 */
function makeReplayScene(initial: ObjectPlacement[]): MapScene {
  const mapData = {
    layers: [{ id: TARGET_LAYER, name: 'Ground', visible: true }],
    objectPlacements: initial.map((placement) => ({ ...placement })),
  }
  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, {
    mapResource: { mapData } as unknown as MapResource,
    entityLibrary: [],
    world: { entityManager: { entities: [] } },
  })
  return scene
}

/** How one mutating entry point treats each gate, plus how to drive it. */
interface GateContract {
  /**
   * `'skip'` means the operation deliberately runs while the assistant
   * is paused — see the method's JSDoc for the written reason.
   */
  readonly assistantPause: 'enforce' | 'skip'
  /** The layer whose lock the operation must consult. */
  readonly targetLayer: string
  readonly invoke: (ops: EditOperations) => boolean
}

const CONTRACT: Record<string, GateContract> = {
  paintTile: {
    assistantPause: 'enforce',
    targetLayer: TARGET_LAYER,
    invoke: (ops) => ops.paintTile({ layerId: null, tileX: 1, tileY: 1, spriteId: 1 }),
  },
  fillTile: {
    assistantPause: 'enforce',
    targetLayer: TARGET_LAYER,
    invoke: (ops) => ops.fillTile({ layerId: null, tileX: 1, tileY: 1, spriteId: 1 }),
  },
  paintTerrain: {
    assistantPause: 'enforce',
    targetLayer: TARGET_LAYER,
    invoke: (ops) =>
      ops.paintTerrain({ layerId: null, tileX: 1, tileY: 1, spriteSetId: 'terrain', terrainId: 'grass' }),
  },
  placeObject: {
    assistantPause: 'enforce',
    targetLayer: TARGET_LAYER,
    invoke: (ops) => ops.placeObject({ defId: 'npc', layerId: null, tileX: 1, tileY: 1 }) !== null,
  },
  removeObject: {
    // The ONLY remove path; the human's Props "Remove" button routes
    // through it, so an engine-level pause gate would disable the
    // user's own button while the assistant is paused.
    assistantPause: 'skip',
    // Dictated by the placement, not by the active layer.
    targetLayer: TARGET_LAYER,
    invoke: (ops) => ops.removeObject(PLACEMENT_ID),
  },
  duplicatePlacement: {
    // It ADDS an object, so the pause gate applies as it does to
    // `placeObject` — unlike the remove path above.
    assistantPause: 'enforce',
    // Dictated by the placement, like `removeObject`.
    targetLayer: TARGET_LAYER,
    invoke: (ops) => ops.duplicatePlacement(PLACEMENT_ID) !== null,
  },
  movePlacement: {
    // The only move path, driven by the human's "Move" button — see
    // `removeObject` for the same reasoning.
    assistantPause: 'skip',
    // Dictated by the placement: a move stays on its own layer.
    targetLayer: TARGET_LAYER,
    invoke: (ops) => ops.movePlacement(PLACEMENT_ID, 2, 2),
  },
  setPlacementOverrides: {
    // Driven by the Selected page's fields; same reasoning again.
    assistantPause: 'skip',
    targetLayer: TARGET_LAYER,
    invoke: (ops) => ops.setPlacementOverrides(PLACEMENT_ID, { name: 'Shopkeeper' }),
  },
}

/** Public (prototype) methods of the class, minus the constructor. */
function publicMethods(): string[] {
  return Object.getOwnPropertyNames(EditOperations.prototype)
    .filter((name) => name !== 'constructor')
    .sort()
}

export default async () => {
  await describe('EditOperations — mutating entry points', async () => {
    await it('declares a gate contract for EVERY public method', async () => {
      // A fifth mutating operation fails here until it says which gates
      // it runs — the check that would have caught `removeObject`'s
      // missing lock the day it was written.
      expect(publicMethods()).toStrictEqual(Object.keys(CONTRACT).sort())
    })

    for (const [name, contract] of Object.entries(CONTRACT)) {
      await it(`${name} refuses a locked target layer`, async () => {
        const harness = makeHarness({ locked: [contract.targetLayer] })
        expect(contract.invoke(harness.ops)).toBe(false)
        expect(harness.executed).toHaveLength(0)
        expect(harness.lockChecks).toContain(contract.targetLayer)
      })

      await it(`${name} proceeds when nothing is locked`, async () => {
        const harness = makeHarness()
        expect(contract.invoke(harness.ops)).toBe(true)
        expect(harness.executed).toHaveLength(1)
      })

      await it(`${name} ignores a lock on an unrelated layer`, async () => {
        const harness = makeHarness({ locked: [OTHER_LAYER] })
        expect(contract.invoke(harness.ops)).toBe(true)
      })

      const paused = contract.assistantPause === 'enforce'
      await it(`${name} ${paused ? 'refuses' : 'still runs'} while the assistant is paused`, async () => {
        const harness = makeHarness({ paused: true })
        expect(contract.invoke(harness.ops)).toBe(!paused)
        expect(harness.executed).toHaveLength(paused ? 0 : 1)
      })
    }

    await it('removeObject checks the lock of the PLACEMENT’s layer, not the active one', async () => {
      // The active layer is the unrelated one; the placement lives on
      // TARGET_LAYER, which is padlocked. Resolving the lock from the
      // active layer would let the delete through.
      const harness = makeHarness({ locked: [TARGET_LAYER] })
      const ops = harness.ops
      expect(ops.removeObject(PLACEMENT_ID)).toBe(false)
      expect(harness.lockChecks).toStrictEqual([TARGET_LAYER])
    })

    await it('removeObject still refuses an unknown placement id', async () => {
      const harness = makeHarness()
      expect(harness.ops.removeObject('does-not-exist')).toBe(false)
      expect(harness.executed).toHaveLength(0)
    })

    await it('placeObject refuses a tile outside the persisted map bounds', async () => {
      // `mapData.columns/rows` is 4×4 and the tilemaps are derived from
      // it — the same bounds predicate the tile paths use.
      const harness = makeHarness()
      expect(harness.ops.placeObject({ defId: 'npc', layerId: null, tileX: 4, tileY: 0 })).toBe(null)
      expect(harness.executed).toHaveLength(0)
    })

    await it('placeObject hands back the id of the placement it created', async () => {
      // Only `placeObject` can know it: `makePlacementId` mixes in a
      // counter and a random suffix, so a caller with follow-up work on
      // the new object (the § 6.2 door back) cannot derive it.
      const harness = makeHarness()
      const newId = harness.ops.placeObject({ defId: 'npc', layerId: null, tileX: 2, tileY: 3 })
      const command = harness.executed[0] as PlaceObjectCommand
      expect(command.payload.placement.id).toBe(newId)
      expect(command.payload.placement.defId).toBe('npc')
      expect(command.payload.placement.inline).toBe(undefined)
    })

    await it('placeObject takes an inline definition instead of a library id', async () => {
      // `inline` IS the definition, so the library lookup must not run —
      // `door` is deliberately absent from the fixture's library.
      const harness = makeHarness()
      const inline = { id: 'ignored', name: 'Door', components: [{ type: 'teleport', targetMapId: 'other' }] }
      const newId = harness.ops.placeObject({ defId: null, inline, layerId: null, tileX: 1, tileY: 1 })
      expect(newId).not.toBe(null)
      const placement = (harness.executed[0] as PlaceObjectCommand).payload.placement
      expect(placement.defId).toBe(undefined)
      expect(placement.inline?.name).toBe('Door')
      // `defId` and `inline` are mutually exclusive and an inline
      // definition's id is conventionally the placement's.
      expect(placement.inline?.id).toBe(newId)
    })

    await it('placeObject refuses a defId that is not in the library', async () => {
      const harness = makeHarness()
      expect(harness.ops.placeObject({ defId: 'door', layerId: null, tileX: 1, tileY: 1 })).toBe(null)
      expect(harness.executed).toHaveLength(0)
    })

    await it('duplicatePlacement puts the copy on the tile to the right, under a fresh id', async () => {
      const harness = makeHarness()
      const newId = harness.ops.duplicatePlacement(PLACEMENT_ID)
      expect(newId).not.toBe(PLACEMENT_ID)
      expect(newId).not.toBe(null)
      const command = harness.executed[0] as PlaceObjectCommand
      expect(command.kind).toBe(PlaceObjectCommand.KIND)
      const copy = command.payload.placement
      expect(copy.id).toBe(newId)
      // Source sits at (1, 1) on a 4×4 map.
      expect(`${copy.tileX},${copy.tileY}`).toBe('2,1')
      expect(copy.layerId).toBe(TARGET_LAYER)
      expect(copy.defId).toBe('npc')
    })

    await it('duplicatePlacement steps left when the right neighbour is off-map', async () => {
      const harness = makeHarness()
      // Last column of a 4×4 map: (4, 1) does not exist, (2, 1) does.
      placementsOf(harness.scene)[0].tileX = 3
      expect(harness.ops.duplicatePlacement(PLACEMENT_ID)).not.toBe(null)
      const copy = (harness.executed[0] as PlaceObjectCommand).payload.placement
      expect(`${copy.tileX},${copy.tileY}`).toBe('2,1')
    })

    await it('duplicatePlacement deep-copies the overrides instead of sharing them', async () => {
      // A Copy that re-stamped the bare `defId` would hand back a stock
      // library instance and drop every per-instance edit; a shallow
      // copy would alias them, so renaming one object renames both.
      const harness = makeHarness()
      const source = placementsOf(harness.scene)[0]
      source.overrides = { name: 'Shopkeeper', components: [{ type: 'dialogue' }] }
      expect(harness.ops.duplicatePlacement(PLACEMENT_ID)).not.toBe(null)
      const copy = (harness.executed[0] as PlaceObjectCommand).payload.placement
      expect(copy.overrides?.name).toBe('Shopkeeper')
      expect(copy.overrides?.components?.[0]?.type).toBe('dialogue')
      copy.overrides!.name = 'Blacksmith'
      expect(source.overrides?.name).toBe('Shopkeeper')
    })

    await it('duplicatePlacement gives an inline definition its own id', async () => {
      // `ObjectPlacement.inline.id` is runtime entity identity and is
      // conventionally the placement's — two placements sharing one
      // would be two objects claiming the same entity.
      const harness = makeHarness()
      const source = placementsOf(harness.scene)[0]
      source.defId = undefined
      source.inline = { id: PLACEMENT_ID, name: 'One-off', components: [] }
      const newId = harness.ops.duplicatePlacement(PLACEMENT_ID)
      const copy = (harness.executed[0] as PlaceObjectCommand).payload.placement
      expect(copy.inline?.id).toBe(newId)
      expect(copy.inline?.name).toBe('One-off')
      expect(source.inline?.id).toBe(PLACEMENT_ID)
    })

    await it('duplicatePlacement refuses an unknown placement id', async () => {
      const harness = makeHarness()
      expect(harness.ops.duplicatePlacement('does-not-exist')).toBe(null)
      expect(harness.executed).toHaveLength(0)
    })

    await it('movePlacement keeps the id and carries the new tile', async () => {
      // The id is the stable key the selection, the save state and every
      // peer use; a move that re-minted it would read as
      // delete-plus-create and drop the selection.
      const harness = makeHarness()
      expect(harness.ops.movePlacement(PLACEMENT_ID, 3, 2)).toBe(true)
      const moved = (harness.executed[0] as PlaceObjectCommand).payload.placement
      expect(moved.id).toBe(PLACEMENT_ID)
      expect(`${moved.tileX},${moved.tileY}`).toBe('3,2')
      expect(moved.layerId).toBe(TARGET_LAYER)
    })

    await it('movePlacement round-trips through apply + revert', async () => {
      const harness = makeHarness()
      expect(harness.ops.movePlacement(PLACEMENT_ID, 3, 2)).toBe(true)
      const command = harness.executed[0] as PlaceObjectCommand
      const scene = makeReplayScene(placementsOf(harness.scene))
      command.apply(scene)
      expect(placementsOf(scene)).toHaveLength(1)
      expect(`${placementsOf(scene)[0].tileX},${placementsOf(scene)[0].tileY}`).toBe('3,2')
      // Revert must put the object back on its old tile, NOT delete it —
      // that is what the same-id `replaced` capture is for.
      command.revert(scene)
      expect(placementsOf(scene)).toHaveLength(1)
      expect(`${placementsOf(scene)[0].tileX},${placementsOf(scene)[0].tileY}`).toBe('1,1')
    })

    await it('movePlacement refuses an off-map tile, a no-op and an unknown id', async () => {
      const harness = makeHarness()
      expect(harness.ops.movePlacement(PLACEMENT_ID, 4, 1)).toBe(false)
      // Already there: an op-log entry and an undo step for nothing.
      expect(harness.ops.movePlacement(PLACEMENT_ID, 1, 1)).toBe(false)
      expect(harness.ops.movePlacement('does-not-exist', 2, 2)).toBe(false)
      expect(harness.executed).toHaveLength(0)
    })

    await it('setPlacementOverrides round-trips through apply + revert', async () => {
      const harness = makeHarness()
      placementsOf(harness.scene)[0].overrides = { name: 'Shopkeeper' }
      expect(harness.ops.setPlacementOverrides(PLACEMENT_ID, { name: 'Blacksmith' })).toBe(true)
      const command = harness.executed[0] as PlaceObjectCommand
      const scene = makeReplayScene(placementsOf(harness.scene))
      command.apply(scene)
      expect(placementsOf(scene)[0].overrides?.name).toBe('Blacksmith')
      command.revert(scene)
      expect(placementsOf(scene)[0].overrides?.name).toBe('Shopkeeper')
    })

    await it('setPlacementOverrides drops the block when there is nothing to override', async () => {
      // `placementOverridesFrom` returns undefined once every field is
      // back at the library's value; the key must go, not become
      // `undefined` — the payload is a wire message and JSON would drop
      // it on the way out, leaving local and remote shapes different.
      const harness = makeHarness()
      placementsOf(harness.scene)[0].overrides = { name: 'Shopkeeper' }
      expect(harness.ops.setPlacementOverrides(PLACEMENT_ID, undefined)).toBe(true)
      const placement = (harness.executed[0] as PlaceObjectCommand).payload.placement
      expect('overrides' in placement).toBe(false)
    })

    await it('setPlacementOverrides refuses an unknown placement id', async () => {
      const harness = makeHarness()
      expect(harness.ops.setPlacementOverrides('does-not-exist', { name: 'Nobody' })).toBe(false)
      expect(harness.executed).toHaveLength(0)
    })
  })
}
