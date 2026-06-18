import type { CharacterDefinition, ComponentData, EntityDefinition, Facing } from '../types/data/index.ts'
import { getComponentData } from './data-access.ts'

/**
 * Pure migration: the shipped `kind`-discriminated object definition →
 * the component-list {@link EntityDefinition}. Used by
 * `scripts/migrate-to-entity-components.mjs` (over `games/*`) and tested
 * in `convert.spec.ts`. Idempotent at the data level: an already-migrated
 * `EntityDefinition` is returned unchanged.
 *
 * The legacy shapes are declared locally because their types were deleted
 * with `ObjectDefinition.ts`; this transform is the only thing that still
 * needs to understand them.
 */

type LegacyKind = 'event' | 'teleport' | 'item' | 'npc' | 'spawn-point' | 'custom'

interface LegacySpriteRef {
  spriteSetId: string
  spriteId: number
  animationId?: string
}

interface LegacyTriggerSpec {
  on: 'walk-onto' | 'walk-off' | 'action-button' | 'auto' | 'none'
  once?: boolean
  scriptId?: string
}

interface LegacyObjectDefinition {
  id: string
  kind: LegacyKind
  name: string
  sprite?: LegacySpriteRef
  trigger?: LegacyTriggerSpec
  blocking?: boolean
  properties?: Record<string, unknown>
  editorData?: { category?: string; icon?: string }
}

/** True when a value already looks like the new component-list shape. */
function isAlreadyEntity(value: unknown): value is EntityDefinition {
  return value != null && typeof value === 'object' && Array.isArray((value as { components?: unknown }).components)
}

/**
 * Convert one legacy object definition to an {@link EntityDefinition}.
 *
 * `onWarn` (optional) is invoked when a legacy `kind` carries no usable
 * payload — e.g. a `teleport` whose `targetMapId` is missing or not a
 * string — so the one-shot, irreversible migration surfaces the silent
 * data loss instead of producing an entity with a dropped component. The
 * function stays pure (no `console`); the migration script passes
 * `console.warn`.
 */
export function objectDefinitionToEntity(
  def: LegacyObjectDefinition | EntityDefinition,
  onWarn?: (message: string) => void,
): EntityDefinition {
  if (isAlreadyEntity(def)) return def
  const legacy = def as LegacyObjectDefinition
  const components: ComponentData[] = []
  const props = (legacy.properties ?? {}) as Record<string, unknown>

  if (legacy.sprite) {
    components.push({
      type: 'visual',
      spriteSetId: legacy.sprite.spriteSetId,
      spriteId: legacy.sprite.spriteId,
      ...(legacy.sprite.animationId ? { animationId: legacy.sprite.animationId } : {}),
    })
  }
  if (legacy.trigger) {
    components.push({
      type: 'trigger',
      on: legacy.trigger.on,
      ...(legacy.trigger.once !== undefined ? { once: legacy.trigger.once } : {}),
      ...(legacy.trigger.scriptId ? { scriptId: legacy.trigger.scriptId } : {}),
    })
  }
  if (legacy.blocking === true) components.push({ type: 'collision' })

  switch (legacy.kind) {
    case 'teleport':
      if (typeof props.targetMapId === 'string') {
        components.push({
          type: 'teleport',
          targetMapId: props.targetMapId,
          targetTileX: Number(props.targetTileX) || 0,
          targetTileY: Number(props.targetTileY) || 0,
          ...(props.facing ? { facing: props.facing as Facing } : {}),
          ...(props.label ? { label: props.label as string } : {}),
        })
      } else {
        onWarn?.(`teleport "${legacy.id}" dropped: missing/invalid targetMapId`)
      }
      break
    case 'item':
      if (typeof props.itemId === 'string') {
        components.push({
          type: 'item',
          itemId: props.itemId,
          ...(props.qty !== undefined ? { qty: Number(props.qty) } : {}),
          ...(props.pickupSound ? { pickupSound: props.pickupSound as string } : {}),
        })
      } else {
        onWarn?.(`item "${legacy.id}" dropped: missing/invalid itemId`)
      }
      break
    case 'npc':
      if (typeof props.dialogueId === 'string') components.push({ type: 'dialogue', dialogueId: props.dialogueId })
      if (Array.isArray(props.route)) {
        components.push({
          type: 'npc-route',
          waypoints: props.route,
          ...(props.facing ? { facing: props.facing as Facing } : {}),
        })
      }
      break
    case 'spawn-point':
      components.push({
        type: 'spawn-point',
        spawnId: typeof props.spawnId === 'string' ? props.spawnId : 'player',
        ...(props.facing ? { facing: props.facing as Facing } : {}),
      })
      break
    case 'event':
    case 'custom':
      break
  }

  // Free-form custom bag → custom-data component.
  const custom = props.custom
  if (custom && typeof custom === 'object' && Object.keys(custom as object).length > 0) {
    components.push({ type: 'custom-data', data: custom as Record<string, unknown> })
  }

  return {
    id: legacy.id,
    name: legacy.name,
    components,
    // Stamp the editor template from the old kind so the migrated data
    // lands categorised in the editor library.
    editorData: {
      template: legacy.kind,
      ...(legacy.editorData?.category ? { category: legacy.editorData.category } : {}),
      ...(legacy.editorData?.icon ? { icon: legacy.editorData.icon } : {}),
    },
  }
}

/** Default movement speed (tiles/sec) when a character omits one. */
const DEFAULT_SPEED_TILES_PER_SEC = 4

/**
 * A character {@link CharacterDefinition} (view model) → an
 * {@link EntityDefinition}: a `visual` component (the appearance sheet,
 * `defaultAnimation` as the animation id) + a `movement` component
 * (speed), tagged `editorData.template === 'character'`. `kind` rides
 * `editorData.category` so it round-trips. The `isPlayer` flag is NOT
 * stored on the entity — it lives in `GameProjectData.playerActorId`.
 */
export function characterToEntity(char: CharacterDefinition): EntityDefinition {
  const components: ComponentData[] = [
    {
      type: 'visual',
      spriteSetId: char.spriteSetId,
      spriteId: 0,
      ...(char.defaultAnimation ? { animationId: char.defaultAnimation } : {}),
    },
    { type: 'movement', tilesPerSec: char.speedTilesPerSec ?? DEFAULT_SPEED_TILES_PER_SEC },
  ]
  return {
    id: char.id,
    name: char.name,
    components,
    editorData: { template: 'character', category: char.kind },
  }
}

/**
 * An {@link EntityDefinition} (a `character`-template entity) → the
 * {@link CharacterDefinition} view model the Cast UI + `PlayerSystem`
 * consume. Returns `null` when the entity has no `visual` component (so
 * it isn't a renderable character). `isPlayer` is set from the project's
 * `playerActorId`.
 */
export function entityToCharacter(def: EntityDefinition, playerActorId?: string): CharacterDefinition | null {
  const visual = getComponentData(def, 'visual')
  const spriteSetId = typeof visual?.spriteSetId === 'string' ? visual.spriteSetId : undefined
  if (!spriteSetId) return null
  const movement = getComponentData(def, 'movement')
  const category = def.editorData?.category
  return {
    id: def.id,
    name: def.name,
    kind: category === 'npc' ? 'npc' : 'hero',
    spriteSetId,
    defaultAnimation: typeof visual?.animationId === 'string' ? visual.animationId : 'idle-down',
    speedTilesPerSec: typeof movement?.tilesPerSec === 'number' ? movement.tilesPerSec : DEFAULT_SPEED_TILES_PER_SEC,
    isPlayer: playerActorId !== undefined && def.id === playerActorId,
  }
}

/** True when an entity definition is a `character`-template cast member. */
export function isCharacterEntity(def: EntityDefinition): boolean {
  return def.editorData?.template === 'character'
}

/**
 * Apply a character view model's friendly fields (name + appearance +
 * speed) onto an EXISTING entity, **preserving every other component**.
 * This is what the Cast inspector's basic fields must use instead of
 * {@link characterToEntity}: regenerating from scratch would silently drop
 * any extra components (dialogue / trigger / …) the user added through the
 * "all components" disclosure. New characters (no existing entity) still go
 * through `characterToEntity`.
 */
export function mergeCharacterIntoEntity(existing: EntityDefinition, char: CharacterDefinition): EntityDefinition {
  const components: ComponentData[] = existing.components.map((c) => ({ ...c }))

  const visualIdx = components.findIndex((c) => c.type === 'visual')
  const visual: ComponentData = {
    ...(visualIdx >= 0 ? components[visualIdx] : { type: 'visual', spriteId: 0 }),
    type: 'visual',
    spriteSetId: char.spriteSetId,
    ...(char.defaultAnimation ? { animationId: char.defaultAnimation } : {}),
  }
  if (visualIdx >= 0) components[visualIdx] = visual
  else components.unshift(visual)

  const movementIdx = components.findIndex((c) => c.type === 'movement')
  const movement: ComponentData = {
    ...(movementIdx >= 0 ? components[movementIdx] : { type: 'movement' }),
    type: 'movement',
    tilesPerSec: char.speedTilesPerSec ?? DEFAULT_SPEED_TILES_PER_SEC,
  }
  if (movementIdx >= 0) components[movementIdx] = movement
  else components.push(movement)

  return {
    ...existing,
    name: char.name,
    components,
    editorData: { ...existing.editorData, template: 'character', category: char.kind },
  }
}
