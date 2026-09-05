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

import type { Command } from '../commands/index.ts'
import { MapEditorComponent } from '../components/map-editor.component.ts'
import { TileMapTierComponent } from '../components/tilemap-tier.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import type { LayerTier } from '../types/data/index.ts'
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
 * per tier, one object placement on {@link TARGET_LAYER}, and a sprite
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
        { id: TARGET_LAYER, name: 'Ground', visible: true, tier: 'ground' },
        { id: OTHER_LAYER, name: 'Decor', visible: true, tier: 'hero' },
      ],
      spriteSets: [{ id: 'terrain', firstGid: 1 }],
      objectPlacements: [{ id: PLACEMENT_ID, layerId: TARGET_LAYER, tileX: 1, tileY: 1, defId: 'npc' }],
    },
    getSpriteSetResource: () => spriteSet,
    getAllSpriteSetResources: () => new Map([['terrain', spriteSet]]),
    refreshTileSolidFromEditor: () => {},
    // biome-ignore lint/suspicious/noExplicitAny: stub mirrors only the surface these operations touch
  } as any as MapResource

  const makeTierTileMap = (tier: LayerTier): TileMap => {
    const tileMap = new TileMap({ tileWidth: 16, tileHeight: 16, columns: 4, rows: 4 })
    tileMap.addComponent(new TileMapTierComponent(tier))
    tileMap.addComponent(new MapEditorComponent())
    return tileMap
  }

  const scene = Object.create(MapScene.prototype) as MapScene
  Object.assign(scene, {
    mapResource,
    entityLibrary: [{ id: 'npc', name: 'NPC' }],
    world: { entityManager: { entities: [makeTierTileMap('ground'), makeTierTileMap('hero')] } },
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
  return { ops, executed, lockChecks }
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
  })
}
