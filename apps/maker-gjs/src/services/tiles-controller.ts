import type { SpriteSetImportResult } from '@pixelrpg/gjs'
import type { TilesView } from '../widgets/tiles-view.ts'
import type { CastController } from './cast-controller.ts'
import type { ProjectStore } from './project-store.ts'
import { countSpriteSetUsers } from './sprite-set-usage.ts'

/**
 * Owns the Tiles (Sheets) view's data + read path — a delegating shell:
 * every mutation routes to the {@link ProjectStore} (sprite-set CRUD +
 * tile properties: the single persist + collab-broadcast pipeline).
 * Animation authoring moved to the Cast matrix, so this controller no
 * longer calls the {@link CastController} — it only SUBSCRIBES to it,
 * which is why `cast` is a plain constructor parameter and not a field.
 *
 * Hydration is event-driven: the view re-loads on the store's
 * `project-changed` / `sprite-sets-changed`, and the Appearances
 * section follows the cast controller's `appearances-changed`.
 */
export class TilesController {
  constructor(
    private readonly view: TilesView,
    private readonly store: ProjectStore,
    cast: CastController,
  ) {
    view.bindCallbacks(this.callbacks)
    // The Sheets view lists appearances as raw assets (import / delete /
    // glance); animation authoring lives in the Cast matrix now. The cast
    // controller still owns appearance data + pushes the list + shared
    // preview map on every refresh so the gallery + glance stay current.
    view.bindAppearanceCallbacks({
      deleteAppearance: (sheetId) => this.store.deleteSpriteSet(sheetId),
    })
    cast.on('appearances-changed', ({ sheets, spriteSetsById }) => {
      this.view.setAppearances(sheets, spriteSetsById)
    })
    // Sprite-set CRUD from the view's gallery → the store, so the
    // copy/register + collab broadcast live in a single place.
    view.connect('spriteset-imported', (_v: TilesView, result: SpriteSetImportResult) => {
      void this.store.importSpriteSet(result)
    })
    view.connect('spriteset-rename-requested', (_v: TilesView, id: string, name: string) => {
      this.store.renameSpriteSet(id, name)
    })
    view.connect('spriteset-reorder-requested', (_v: TilesView, orderedIds: string[]) => {
      this.store.reorderSpriteSets(orderedIds)
    })
    view.connect('spriteset-delete-requested', (_v: TilesView, id: string) => {
      this.store.deleteSpriteSet(id)
    })
    store.on('project-changed', (project) => {
      void this.view.setProject(project?.resource ?? null)
    })
    // Sprite-sets are shared project assets shown in BOTH the Cast view
    // (a character's sheet) and this view (a tileset) — re-hydrate on
    // any set change (import / delete / rename / inbound peer op).
    store.on('sprite-sets-changed', () => {
      void this.view.setProject(this.store.resource)
    })
  }

  /** Wire once into `TilesView.bindCallbacks`. */
  readonly callbacks = {
    // Tile-property mutations (Solid / Surface) delegate to the store —
    // the single owner of sprite-set descriptor writes + collab
    // broadcast — so a local edit persists, broadcasts a
    // `__project/spriteset.update.chunk` to peers, and refreshes live
    // engine collision through the host's `tile-properties-changed`
    // subscription. This controller only refreshes the inspector
    // afterwards so the switch reflects the new state.
    setSolid: (spriteSetId: string, spriteId: number, solid: boolean) => {
      this.store.setTileSolid(spriteSetId, spriteId, solid)
      this.view.refreshInspectorForSelection()
    },
    setSurface: (spriteSetId: string, spriteId: number, surface: string | null) => {
      this.store.setTileSurface(spriteSetId, spriteId, surface)
      this.view.refreshInspectorForSelection()
    },
    // How many characters + maps reference this set — drives the delete
    // confirmation's "still used in N place(s)" warning.
    tilesetUsage: (spriteSetId: string): number => {
      const resource = this.store.resource
      if (!resource) return 0
      return countSpriteSetUsers(resource).get(spriteSetId) ?? 0
    },
  }
}
