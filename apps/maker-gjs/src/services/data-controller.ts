import { EDITOR_CONSTANTS, type MapData, type SpriteSetKind } from '@pixelrpg/engine'

// biome-ignore lint/suspicious/noShadowRestrictedNames: GTK view-class naming convention (CastView/TilesView/DataView); the JS DataView global is unused in this app
import type { DataView, DataViewModel } from '../widgets/data-view.ts'
import { buildGameRulesModel } from './game-rules-model.ts'
import type { ProjectStore } from './project-store.ts'
import { isCharacterSpriteSet } from './sprite-set-classification.ts'
import { countCharacterUsers } from './sprite-set-usage.ts'
import { TypedEmitter } from './typed-emitter.ts'

/**
 * Typed event map for {@link DataController.on}. The Data view no longer
 * manages assets (that moved to Cast / Sheets — it just references them),
 * so these are currently dormant; kept as the seam for any future
 * project-level action the Data view might route to the host window.
 * TODO: remove once confirmed no consumer needs them (also drop the
 * window's now-inert `_presentAssetImport`/`_openAsset`/`_presentRenameAsset`/
 * `_presentDeleteAsset` handlers + their subscriptions).
 */
export interface DataControllerEvents {
  'import-requested': { kind: SpriteSetKind }
  'open-requested': { id: string; kind: SpriteSetKind }
  'rename-requested': { id: string; currentName: string }
  'delete-requested': { id: string; name: string; usedBy: number }
}

/**
 * The map data currently in memory. Placements in unloaded maps are not
 * counted by the Game-rules usage numbers — the alternative is parsing
 * every map file to draw one subtitle.
 */
function loadedMapData(maps: Iterable<{ mapData?: MapData | null }>): MapData[] {
  return [...maps].flatMap((m) => (m.mapData ? [m.mapData] : []))
}

/**
 * Owns the Data view's model: project metadata (name / author / version /
 * description / tile size) routed into the {@link ProjectStore} (the
 * single owner of project persistence + the `__project/meta.update` collab
 * broadcast), plus asset COUNTS for the "Linked assets" reference rows.
 * Assets themselves are owned + edited in Cast / Sheets — Data only links
 * to them. The store's `sprite-sets-changed` / `project-meta-changed`
 * events re-hydrate this view.
 */
export class DataController {
  private readonly _events = new TypedEmitter<DataControllerEvents>()

  constructor(
    private readonly view: DataView,
    private readonly store: ProjectStore,
  ) {
    view.bindCallbacks({
      setProjectField: (field, value) => this.setProjectField(field, value),
      setGameSystemEnabled: (id, enabled) => this.store.setGameSystemEnabled(id, enabled),
    })
    store.on('project-changed', (project) => {
      if (!project) {
        this.view.setData(null)
        return
      }
      this._rebuild()
    })
    // The counts mirror the sprite-set library — re-hydrate on any set
    // change; an inbound peer meta update re-renders the metadata rows
    // (local edits don't, by design — no row re-render mid-typing).
    store.on('sprite-sets-changed', () => {
      if (this.store.project) this._rebuild()
    })
    store.on('project-meta-changed', () => {
      if (this.store.project) this._rebuild()
    })
    // A switch flip here or on a peer changes which rows the page shows
    // and what "Used by" counts.
    store.on('game-systems-changed', () => {
      if (this.store.project) this._rebuild()
    })
    // The library is what "Used by" counts, so it re-hydrates with it.
    store.on('entity-library-changed', () => {
      if (this.store.project) this._rebuild()
    })
  }

  /** Subscribe to a controller event. Returns an unsubscribe closure. */
  on<K extends keyof DataControllerEvents>(event: K, listener: (payload: DataControllerEvents[K]) => void): () => void {
    return this._events.on(event, listener)
  }

  /** Persist a single project-metadata field edit (no row re-render). */
  setProjectField(field: 'name' | 'author' | 'version' | 'description' | 'tileSize', value: string): void {
    const data = this.store.data
    if (!data) return
    data.properties ??= {}
    const props = data.properties
    switch (field) {
      case 'name':
        data.name = value
        props.gameTitle = value
        break
      case 'author':
        props.author = value
        break
      case 'version':
        props.version = value
        break
      case 'description':
        props.description = value
        break
      case 'tileSize': {
        const n = Number.parseInt(value, 10)
        if (Number.isFinite(n) && n > 0) props.defaultTileSize = n
        break
      }
    }
    // Persist + coarse broadcast (the whole name + properties bag, so
    // the receiver replaces wholesale — idempotent, mirrors entity.upsert).
    this.store.commitProjectMeta()
  }

  /**
   * Rebuild the view model: project metadata + asset COUNTS. Assets are
   * owned + edited in Cast / Sheets; Data only references them, so this
   * just tallies how many appearances vs tilesets exist (classified the
   * same way the Cast/Sheets split does).
   */
  private _rebuild(): void {
    const resource = this.store.resource
    if (!resource?.data) {
      this.view.setData(null)
      return
    }
    const data = resource.data
    const props = data.properties ?? {}

    const charUsers = countCharacterUsers(resource)
    let appearanceCount = 0
    let tilesetCount = 0
    for (const [id, engineSet] of resource.spriteSets) {
      const sd = engineSet.data
      if (!sd) continue
      if (isCharacterSpriteSet(sd.kind, (charUsers.get(id) ?? 0) > 0)) appearanceCount++
      else tilesetCount++
    }

    const model: DataViewModel = {
      name: data.name ?? '',
      author: typeof props.author === 'string' ? props.author : '',
      version: typeof props.version === 'string' ? props.version : '',
      description: typeof props.description === 'string' ? props.description : '',
      tileSize: typeof props.defaultTileSize === 'number' ? props.defaultTileSize : EDITOR_CONSTANTS.DEFAULT_TILE_SIZE,
      path: resource.path,
      appearanceCount,
      tilesetCount,
      gameRules: buildGameRulesModel({ project: data, maps: loadedMapData(resource.maps.values()) }),
    }
    this.view.setData(model)
  }
}
