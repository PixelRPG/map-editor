import {
  applyEntityRemove,
  applyEntityUpsert,
  applyPlayerSet,
  ENTITY_REMOVE_KIND,
  ENTITY_UPSERT_KIND,
  type EntityDefinition,
  type GameProjectData,
  type MapReference,
  PLAYER_SET_KIND,
  type ProjectOp,
} from '@pixelrpg/engine'

/**
 * Pure entity-library reads and the entity-library slice of the
 * inbound-op router behind `ProjectStore`. gi-free so they unit-test
 * under the node target; the store keeps persistence, broadcast and
 * event ordering.
 */

/** One choice in a component inspector's ref picker. */
export interface RefOption {
  value: string
  label: string
}

/** The entity definition with the given id, or `null`. */
export function findEntityById(entities: readonly EntityDefinition[], id: string): EntityDefinition | null {
  return entities.find((e) => e.id === id) ?? null
}

/**
 * Project ref-picker options for the component inspectors: every map by
 * id, and every loaded sprite set as a selectable appearance. Falls back
 * to the id as the label wherever a display name is missing.
 */
export function buildRefOptions(
  maps: readonly MapReference[] | undefined,
  spriteSets: ReadonlyMap<string, { data?: { name?: string } }> | undefined,
): { maps: RefOption[]; appearances: RefOption[] } {
  return {
    maps: (maps ?? []).map((m) => ({ value: m.id, label: m.name ?? m.id })),
    appearances: spriteSets
      ? [...spriteSets.entries()].map(([id, set]) => ({ value: id, label: set.data?.name ?? id }))
      : [],
  }
}

/**
 * Apply an inbound entity-library op (`entity.upsert`, `entity.remove`
 * or `player.set`) to `data`, reporting whether it matched. `false`
 * leaves `data` untouched and tells the caller to keep routing — the
 * remaining `__project/*` kinds need more than a `GameProjectData`.
 * Idempotent: the engine's `apply*` helpers replace-by-id.
 */
export function applyEntityLibraryOp(data: GameProjectData, op: ProjectOp): boolean {
  if (op.kind === ENTITY_UPSERT_KIND) {
    applyEntityUpsert(data, op.payload.entity)
  } else if (op.kind === ENTITY_REMOVE_KIND) {
    applyEntityRemove(data, op.payload.entityId)
  } else if (op.kind === PLAYER_SET_KIND) {
    applyPlayerSet(data, op.payload.playerActorId)
  } else {
    return false
  }
  return true
}
