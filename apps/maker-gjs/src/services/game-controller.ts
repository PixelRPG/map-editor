import { EDITOR_CONSTANTS, type MapData } from '@pixelrpg/engine'

import type { GameView, GameViewModel } from '../widgets/game-view.ts'
import { buildGameRulesModel } from './game-rules-model.ts'
import type { ProjectStore } from './project-store.ts'

/**
 * The map data currently in memory. Placements in unloaded maps are not
 * counted by the Game-rules usage numbers — the alternative is parsing
 * every map file to draw one subtitle.
 */
function loadedMapData(maps: Iterable<{ mapData?: MapData | null }>): MapData[] {
  return [...maps].flatMap((m) => (m.mapData ? [m.mapData] : []))
}

/**
 * Owns the Game page's model: project metadata (name / author / version /
 * description / tile size) routed into the {@link ProjectStore} (the
 * single owner of project persistence + the `__project/meta.update` collab
 * broadcast) and the game-rules model. The store's `project-meta-changed`
 * / `game-systems-changed` / `entity-library-changed` events re-hydrate
 * this view.
 */
export class GameController {
  constructor(
    private readonly view: GameView,
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
    // An inbound peer meta update re-renders the metadata rows (local
    // edits don't, by design — no row re-render mid-typing).
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

  /** Rebuild the view model: project metadata + the game-rules model. */
  private _rebuild(): void {
    const resource = this.store.resource
    if (!resource?.data) {
      this.view.setData(null)
      return
    }
    const data = resource.data
    const props = data.properties ?? {}

    const model: GameViewModel = {
      name: data.name ?? '',
      author: typeof props.author === 'string' ? props.author : '',
      version: typeof props.version === 'string' ? props.version : '',
      description: typeof props.description === 'string' ? props.description : '',
      tileSize: typeof props.defaultTileSize === 'number' ? props.defaultTileSize : EDITOR_CONSTANTS.DEFAULT_TILE_SIZE,
      path: resource.path,
      gameRules: buildGameRulesModel({ project: data, maps: loadedMapData(resource.maps.values()) }),
    }
    this.view.setData(model)
  }
}
