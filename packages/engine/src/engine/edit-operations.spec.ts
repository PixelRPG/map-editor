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
  const spriteSet = { sprites: { 0: makeFakeSprite(), 1: makeFakeSprite() }, animations: {} }
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
  placeObject: {
    assistantPause: 'enforce',
    targetLayer: TARGET_LAYER,
    invoke: (ops) => ops.placeObject({ defId: 'npc', layerId: null, tileX: 1, tileY: 1 }),
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
      expect(harness.ops.placeObject({ defId: 'npc', layerId: null, tileX: 4, tileY: 0 })).toBe(false)
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
  })
}
