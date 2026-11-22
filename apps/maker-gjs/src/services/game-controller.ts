import {
  EDITOR_CONSTANTS,
  effectiveLanguages,
  hasTextIn,
  localeLabel,
  type GameProjectData,
  type MapData,
  missingTextCount,
} from '@pixelrpg/engine'

import type { HeroOption, StartMapOption } from '../widgets/game/game-dialogs.ts'
import type { GameView, GameViewModel, LanguageRow } from '../widgets/game-view.ts'
import { listCharacterViewModels } from './cast-controller-view-model.ts'
import { buildGameCheckup } from './game-checkup.model.ts'
import { buildGameRulesModel } from './game-rules-model.ts'
import { collectAtlasTeleports } from './project-loader.ts'
import type { ProjectStore } from './project-store.ts'

/**
 * The map data currently in memory. Placements in unloaded maps are not
 * counted by the Game-rules usage numbers — the alternative is parsing
 * every map file to draw one subtitle.
 */
function loadedMapData(maps: Iterable<{ mapData?: MapData | null }>): MapData[] {
  return [...maps].flatMap((m) => (m.mapData ? [m.mapData] : []))
}

/** The Languages section's rows: default first, each with its missing-text count. */
function languageRows(data: GameProjectData, maps: readonly MapData[]): LanguageRow[] {
  const { default: fallback, others } = effectiveLanguages(data.languages)
  return [fallback, ...others].map((code) => ({
    code,
    label: localeLabel(code),
    isDefault: code === fallback,
    missing: missingTextCount(data, maps, code),
    hasText: hasTextIn(data, maps, code),
  }))
}

/** One map, as the start-map picker and the title-card cover read it. */
function mapOption(data: MapData): StartMapOption {
  return { id: data.id, name: data.name?.trim() || data.id }
}

/**
 * Owns the Game page's model: project metadata (name / author / version /
 * description / tile size) routed into the {@link ProjectStore} (the
 * single owner of project persistence + the `__project/meta.update` collab
 * broadcast), the checkup, the start map / hero pickers and the
 * game-rules model. The store's `project-meta-changed` /
 * `game-systems-changed` / `entity-library-changed` / `maps-changed`
 * events re-hydrate this view.
 */
/** The window's side of removing a credit: a toast whose Undo runs `undo`. */
export interface CreditRemoveHost {
  reportCreditRemoved(name: string, undo: () => void): void
  /** "Test in": the language a test run speaks (`undefined` = the project default). */
  setTestLocale(locale: string | undefined): void
}

export class GameController {
  constructor(
    private readonly view: GameView,
    private readonly store: ProjectStore,
    host: CreditRemoveHost,
  ) {
    view.bindCallbacks({
      setProjectField: (field, value) => this.setProjectField(field, value),
      setGameSystemEnabled: (id, enabled) => this.store.setGameSystemEnabled(id, enabled),
      setStartMap: (mapId) => {
        this.store.setStartMap(mapId)
      },
      setHero: (characterId) => this.store.setPlayerActor(characterId, 'cast'),
      setCredits: (credits) => this.store.setCredits(credits),
      reportCreditRemoved: (name, undo) => host.reportCreditRemoved(name, undo),
      setLanguages: (languages) => {
        this.store.setLanguages(languages)
      },
      setTestLocale: (locale) => host.setTestLocale(locale),
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
    // The library is what "Used by" counts and where the hero comes
    // from, so it re-hydrates with it.
    store.on('entity-library-changed', () => {
      if (this.store.project) this._rebuild()
    })
    // The checkup reads every map and every door, and the title card
    // draws the start map — so adding, deleting or renaming a map, and
    // pointing the game at another one, all re-render this page.
    store.on('maps-changed', () => {
      if (this.store.project) this._rebuild()
    })
    // The language list, and with it every missing-text count.
    store.on('languages-changed', () => {
      if (this.store.project) this._rebuild()
    })
    // A local edit or a peer's `__project/credits.set`.
    store.on('credits-changed', () => {
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

  /**
   * Re-read the project into the page. Text edits made on the map never
   * reach the store's events, so the Game page calls this on every visit
   * to keep the missing-text counts current.
   */
  refresh(): void {
    if (this.store.project) this._rebuild()
  }

  /**
   * Rebuild the whole view model in one shot: project metadata, the
   * checkup, the Start pickers' options and the game-rules model.
   */
  private _rebuild(): void {
    const resource = this.store.resource
    if (!resource?.data) {
      this.view.setData(null)
      return
    }
    const data = resource.data
    const props = data.properties ?? {}

    const maps = loadedMapData(resource.maps.values())
    const mapOptions = maps.map(mapOption)
    const characters: HeroOption[] = listCharacterViewModels(data).map((c) => ({ id: c.id, name: c.name }))
    const startMapId = this.store.startMapId()
    const heroId = data.playerActorId ?? null

    const model: GameViewModel = {
      name: data.name ?? '',
      author: typeof props.author === 'string' ? props.author : '',
      version: typeof props.version === 'string' ? props.version : '',
      description: typeof props.description === 'string' ? props.description : '',
      tileSize: typeof props.defaultTileSize === 'number' ? props.defaultTileSize : EDITOR_CONSTANTS.DEFAULT_TILE_SIZE,
      path: resource.path,
      gameRules: buildGameRulesModel({ project: data, maps }),
      checkup: buildGameCheckup({
        playerActorId: heroId,
        startMapId,
        maps: mapOptions,
        doors: collectAtlasTeleports(maps, data.entityLibrary ?? []),
        characterIds: characters.map((c) => c.id),
      }),
      startMap: mapOptions.find((m) => m.id === startMapId) ?? null,
      hero: characters.find((c) => c.id === heroId) ?? null,
      maps: mapOptions,
      characters,
      projectResource: resource,
      credits: this.store.credits(),
      languages: languageRows(data, maps),
    }
    this.view.setData(model)
  }
}
