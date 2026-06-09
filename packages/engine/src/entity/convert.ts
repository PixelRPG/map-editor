import type { ComponentData, EntityDefinition, Facing } from '../types/data/index.ts'

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

/** Convert one legacy object definition to an {@link EntityDefinition}. */
export function objectDefinitionToEntity(def: LegacyObjectDefinition | EntityDefinition): EntityDefinition {
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
