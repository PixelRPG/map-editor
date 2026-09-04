import type { LoadedProject } from './project-loader.ts'

/**
 * The outward contract of `ProjectStore`: what it tells its lenses and
 * its host window happened. Kept beside the store rather than inside it
 * because every consumer (`CastController`, `ObjectsController`,
 * `TilesController`, `DataController`, `ApplicationWindow`) imports
 * these names without needing the store's implementation.
 */

/**
 * Which local surface initiated an entity-library mutation. Lenses use
 * it to skip re-hydrating themselves for edits they originated (their
 * view already reflects the change optimistically) while every OTHER
 * lens refreshes. `'remote'` (an inbound peer op) refreshes everyone.
 */
export type EntityLibraryChangeSource = 'cast' | 'objects' | 'remote'

/**
 * User-facing notification from the store. The store is UI-free (it also
 * runs in the node test bundle, where GJS's `gettext` builtin does not
 * exist), so it emits semantic notices and the window translates +
 * toasts them — the same pattern `SessionService` uses for its toasts.
 */
export type ProjectStoreNotice =
  | { kind: 'image-copy-failed' }
  | { kind: 'sprite-set-save-failed' }
  | { kind: 'project-save-failed' }
  | { kind: 'sprite-set-imported'; name: string }

/** Typed event map for `ProjectStore.on`. */
export interface ProjectStoreEvents {
  /** A user-facing notice — the host translates + shows it as a toast. */
  notice: ProjectStoreNotice
  /** The active project was swapped (or cleared with `null`). */
  'project-changed': LoadedProject | null
  /** `entityLibrary` / `playerActorId` changed (local mutation or inbound peer op). */
  'entity-library-changed': { source: EntityLibraryChangeSource }
  /**
   * The sprite-set list or a set's descriptor changed (import / delete /
   * rename / reorder / inbound peer add, remove or update). `spriteSetId`
   * names the affected set when the change is per-set; absent for
   * list-order changes.
   */
  'sprite-sets-changed': { spriteSetId?: string }
  /**
   * A sprite-set descriptor's tile properties changed — a local Solid /
   * Surface edit or an inbound peer descriptor update — so the host can
   * refresh live engine collision when a scene is open.
   */
  'tile-properties-changed': { spriteSetId: string }
  /**
   * An inbound `__project/meta.update` landed on the project data
   * (name / author / version / description / `defaultTileSize`).
   */
  'project-meta-changed': undefined
  /**
   * An inbound `__project/map.editor-data` patched a map's `editorData`
   * (today: atlas card position). The host — the owner of map-file IO —
   * persists that map + refreshes the atlas.
   */
  'map-editor-data-changed': { mapId: string }
}
