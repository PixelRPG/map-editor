import type { EntityDefinition } from '@pixelrpg/engine'
import type { EntityLibraryChangeSource } from './project-store-events.ts'
import type { ProjectStore } from './project-store.ts'

/**
 * Deleting a character or a thing from the library, and taking it back.
 *
 * Library deletes are project-level data (`__project/entity.remove`), so
 * they ride no undo stack — REDESIGN.md § 4.4 still asks for a Delete that
 * is "undoable by toast". The snapshot taken here IS that undo: restoring
 * it is a plain, idempotent `entity.upsert` (plus `player.set` when the
 * deleted entity happened to be the hero), which broadcasts to peers like
 * any other library write.
 *
 * The capture half is pure so it can be unit-tested headlessly; the apply
 * half needs the store and is kept beside it so both ends of the round trip
 * read as one thing.
 */

/** Everything needed to put a deleted library entry back. */
export interface EntityDeletion {
  /** The definition as it stood before the delete. */
  readonly entity: EntityDefinition
  /** Whether the project's `playerActorId` pointed at it. */
  readonly wasPlayer: boolean
}

/**
 * Snapshot the entity about to be deleted, or `null` when the id names
 * nothing (then there is nothing to delete and nothing to restore).
 *
 * The entity is captured by reference: callers hand the snapshot straight
 * to {@link restoreEntityDeletion}, and the store's own writes replace
 * array entries rather than mutating them in place.
 */
export function captureEntityDeletion(
  entities: readonly EntityDefinition[],
  id: string,
  playerActorId: string | null | undefined,
): EntityDeletion | null {
  const entity = entities.find((candidate) => candidate.id === id)
  if (!entity) return null
  return { entity, wasPlayer: playerActorId === id }
}

/** What to call a deleted entry in the toast — its name, or the bare id. */
export function deletedEntityLabel(deletion: EntityDeletion): string {
  const name = deletion.entity.name.trim()
  return name.length > 0 ? name : deletion.entity.id
}

/**
 * Put a captured deletion back: re-upsert the definition and, when it was
 * the hero, restore `playerActorId` too. Both writes are the ordinary
 * project-op path, so peers converge on the same library.
 */
export function restoreEntityDeletion(
  store: ProjectStore,
  source: EntityLibraryChangeSource,
  deletion: EntityDeletion,
): void {
  store.upsertEntity(deletion.entity, source)
  if (deletion.wasPlayer) store.setPlayerActor(deletion.entity.id, source)
}

/**
 * The window's side of a library delete: show the "… deleted" toast with an
 * Undo button that runs `undo`. Implemented by `ApplicationWindow`, which
 * owns the toast overlay; the controllers only hold this slice of it.
 */
export interface EntityDeleteHost {
  reportEntityDeleted(name: string, undo: () => void): void
}
