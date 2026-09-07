import { Color, type EventEmitter, type Engine as ExcaliburEngine, Loader, Logger } from 'excalibur'
import { SpawnOverrideComponent } from '../components/index.ts'
import { effectiveComponentRegistry, effectiveGameSystems } from '../game-systems/registry.ts'
import { GameProjectResource } from '../resource/GameProjectResource.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { resolvePlayerCharacter } from '../services/player-character.ts'
import { applyRuntimeMode } from '../services/runtime-mode.ts'
import { EngineEvent, type EngineEventMap, EngineStatus, type Facing, type ProjectLoadOptions } from '../types/index.ts'
import { ProjectLoadInProgressError } from './project-load-in-progress.error.ts'
import { formatError } from '../utils/format-error.ts'
import { SessionState } from '../utils/session-state.ts'
import { swapInScene } from './scene-swap.ts'

/**
 * Excalibur's `Loader` exposes events through an untyped `on`; this is
 * the narrow view of it, so each handler receives a typed payload.
 */
interface LoaderEventMap {
  progress: { progress: number }
  error: unknown
  complete: undefined
  afterload: undefined
}

/** Per-map-switch options — see {@link ProjectLoader.loadMap}. */
export interface MapLoadOptions {
  readonly spawnOverride?: { tileX: number; tileY: number; facing?: Facing }
  readonly keepRuntimeMode?: boolean
  readonly keepZoom?: boolean
}

/** What the loader needs back from the engine that owns it. */
export interface ProjectLoaderHost {
  readonly excalibur: ExcaliburEngine
  readonly events: EventEmitter<EngineEventMap>
  setStatus(status: EngineStatus): void
  /** Play state of the CURRENT scene, read before a switch is performed. */
  isRuntimeMode(): boolean
}

/**
 * Owns project + map loading: the two operations that create the
 * engine's world rather than editing it.
 *
 * Scene switching lives here because it is the only place that knows
 * how a `MapScene` is composed — which player character to hand it,
 * which session-singleton state must be planted BEFORE `goToScene` (the
 * scene's systems read it during their initialize pass), and which
 * per-scene state has to be carried across the switch by hand because
 * scenes are rebuilt from data every time.
 */
export class ProjectLoader {
  private readonly logger = Logger.getInstance()
  private resource: GameProjectResource | null = null
  private activeMapId: string | null = null
  /**
   * The startup-map load kicked off from the loader's `afterload` event.
   *
   * Excalibur emits `afterload` synchronously and discards whatever the
   * handler returns, so an `async` handler keeps running after
   * `excalibur.start()` has already resolved. Parking the promise here
   * lets {@link loadProject} await it, which is what makes "the project
   * is loaded" mean "and its startup map is on screen" rather than "and
   * a map load is still in flight behind your back".
   */
  private startupMapLoad: Promise<void> | null = null
  /** Set for the duration of a {@link loadProject} — see the guard there. */
  private loadInFlight = false

  constructor(private readonly host: ProjectLoaderHost) {}

  /** Currently loaded project resource, `null` until `loadProject` completes. */
  get gameProjectResource(): GameProjectResource | null {
    return this.resource
  }

  /**
   * Id of the map that is live, or `null` before the first
   * {@link loadMap}. `loadProject` activates the project's
   * `startup.initialMapId` on its own, so a host that wants to know
   * which map it ended up with has to ask rather than assume none.
   */
  get currentMapId(): string | null {
    return this.activeMapId
  }

  /**
   * Load a project and leave its startup map on screen.
   *
   * Resolves only once that map load has finished, so
   * {@link currentMapId} is answerable the moment this returns — a
   * caller that reads it earlier gets `null` and asks for a map load the
   * engine is already performing.
   *
   * Refuses to start while another load is in flight. Two overlapping
   * `excalibur.start()` calls on one Excalibur engine DEADLOCK: the
   * second overwrites `Engine._loader` mid-flight and neither
   * `Loader.load()` ever reaches its `afterload`, so no map is loaded
   * and both callers wait forever with nothing thrown. Reporting that as
   * an error is the difference between a bug you can see and an editor
   * that silently sits on an empty scene.
   */
  async loadProject(projectPath: string, options?: ProjectLoadOptions): Promise<void> {
    if (this.loadInFlight) {
      throw new ProjectLoadInProgressError(projectPath)
    }
    this.loadInFlight = true
    try {
      await this.runProjectLoad(projectPath, options)
    } finally {
      this.loadInFlight = false
    }
  }

  private async runProjectLoad(projectPath: string, options?: ProjectLoadOptions): Promise<void> {
    this.host.setStatus(EngineStatus.LOADING)
    this.logger.info(`[Engine] Loading project: ${projectPath}`)

    this.startupMapLoad = null
    this.resource = new GameProjectResource(projectPath, {
      preloadAllSpriteSets: options?.preloadAllSpriteSets ?? true,
      preloadAllMaps: options?.preloadAllMaps ?? false,
    })

    const loader = new Loader([this.resource])
    this.wireLoaderEvents(loader, projectPath, options)

    await this.host.excalibur.start(loader)
    // `start()` resolves when the loader is done; the startup map is
    // loaded from the loader's `afterload` handler, whose promise
    // Excalibur does not await. Await it here so the project is fully on
    // screen — and `currentMapId` truthful — before this returns.
    await this.startupMapLoad
    // Re-apply resolution + viewport after the canvas size is settled
    // (the gjsify widget emits the final size asynchronously).
    try {
      this.host.excalibur.screen.applyResolutionAndViewport()
    } catch {
      // screen not ready yet — ignore
    }
  }

  /**
   * Load a map and switch the active scene to it.
   *
   * `options.spawnOverride` plants a {@link SpawnOverrideComponent} on
   * the NEW scene's session-singleton BEFORE `goToScene`, so
   * `PlayerSystem.resolveSpawnTile` deterministically sees it when the
   * scene initialises — no reliance on event-tick ordering. Used by the
   * teleport flow to position the player at the arrival tile.
   * `options.keepRuntimeMode` carries the play state across the switch
   * (mode markers are per-scene), so a mid-play teleport stays in play.
   * `options.keepZoom` carries the camera zoom (cameras are per-scene
   * and reset to 1 otherwise) — a teleport should not yank the player to
   * a different zoom level.
   *
   * Re-entering a previously visited map rebuilds the scene from data
   * (no scene instance is reused) — RPG-Maker-style room reset; save
   * state is a future concern.
   */
  async loadMap(mapId: string, options?: MapLoadOptions): Promise<void> {
    const resource = this.resource
    if (!resource) {
      throw new Error('Project not loaded')
    }
    // Capture BEFORE the switch — both read the current scene.
    const carryRuntime = (options?.keepRuntimeMode ?? false) && this.host.isRuntimeMode()
    const carryZoom = options?.keepZoom ? this.host.excalibur.currentScene?.camera.zoom : undefined

    this.logger.info(`Loading map: ${mapId}`)
    const mapResource = await resource.loadMap(mapId)
    const scene = this.buildScene(mapResource)

    // Session-singleton state must be in place BEFORE goToScene so the
    // scene's systems read it during their initialize pass.
    if (options?.spawnOverride) {
      const { tileX, tileY, facing } = options.spawnOverride
      SessionState.set(scene, new SpawnOverrideComponent(tileX, tileY, facing))
    }
    if (carryRuntime) applyRuntimeMode(scene, true)
    if (carryZoom !== undefined && carryZoom > 0) scene.camera.zoom = carryZoom

    // Map-declared room colour → GL clear colour. A colour *actor* would
    // go through Excalibur's `Rectangle` Raster (2D-canvas rasterise),
    // which the GJS canvas path doesn't survive — the clear colour is
    // pure GL and also matches the original-game semantic (fill the
    // screen, tiles on top). Reset to transparent for maps without one
    // so the editor backdrop shows through.
    this.host.excalibur.backgroundColor = mapResource.mapData.backgroundColor
      ? Color.fromHex(mapResource.mapData.backgroundColor)
      : Color.Transparent

    // Re-entry drops the stale scene instance so the room rebuilds fresh
    // from data, and the switch is AWAITED so the engine is actually
    // showing `scene` before `MAP_LOADED` claims it is — see
    // {@link swapInScene} for both contracts and what breaks without them.
    await swapInScene(this.host.excalibur, mapId, scene)
    this.activeMapId = mapId

    this.logger.info(`Map ${mapResource.mapData.name} loaded`)
    this.host.events.emit(EngineEvent.MAP_LOADED, { mapId })
  }

  /**
   * Compose the scene for `mapResource`. The player's sprite-set is
   * resolved at the PROJECT level: character-only sprite-sets (e.g. the
   * scientist) live on the project, not in any map JSON.
   */
  private buildScene(mapResource: MapResource): MapScene {
    const projectData = this.resource?.data
    const playerCharacter = resolvePlayerCharacter(projectData) ?? undefined
    const playerSpriteSet = playerCharacter ? this.resource?.spriteSets.get(playerCharacter.spriteSetId) : undefined
    // Where the project's switched-on game systems become runtime: the
    // effective system list contributes its ECS systems, and the
    // effective component registry gates what the spawn pipeline builds
    // so a component whose system is off stays dormant instead of running.
    return new MapScene(mapResource, this.host.events, {
      entityLibrary: projectData?.entityLibrary ?? [],
      playerCharacter,
      playerSpriteSet,
      gameSystems: effectiveGameSystems(projectData),
      gameSystemConfig: gameSystemConfigOf(projectData),
      componentRegistry: effectiveComponentRegistry(projectData),
    })
  }

  private wireLoaderEvents(loader: Loader, projectPath: string, options?: ProjectLoadOptions): void {
    const loaderEvents = loader as unknown as {
      on<E extends keyof LoaderEventMap>(name: E, handler: (payload: LoaderEventMap[E]) => void): void
    }

    loaderEvents.on('progress', (event) => {
      if (typeof event?.progress === 'number') {
        this.logger.debug(`Loading progress: ${Math.round(event.progress * 100)}%`)
      }
    })

    loaderEvents.on('error', (error) => {
      this.logger.error('Loader error:', error)
      this.host.setStatus(EngineStatus.ERROR)
      this.host.events.emit(EngineEvent.ERROR, {
        message: 'Loader error',
        cause: error instanceof Error ? error : new Error(String(error)),
      })
    })

    loaderEvents.on('complete', () => {
      this.logger.info('Loading complete')
    })

    // Excalibur emits `afterload` synchronously and ignores what the
    // handler returns, so this body outlives `excalibur.start()`. Park
    // its promise where `loadProject` can await it rather than letting a
    // map load run unobserved behind the caller.
    loaderEvents.on('afterload', () => {
      this.startupMapLoad = this.openStartupMap(projectPath, options)
    })
  }

  /** The tail of a project load: announce it, then open its startup map. */
  private async openStartupMap(projectPath: string, options?: ProjectLoadOptions): Promise<void> {
    this.logger.info('GameProjectResource loaded successfully')
    this.resource?.debugInfo()

    this.host.events.emit(EngineEvent.PROJECT_LOADED, { projectPath, options })

    const initialMapId = this.resource?.data.startup.initialMapId
    if (initialMapId) {
      await this.loadMap(initialMapId)
    }

    this.host.setStatus(EngineStatus.READY)
  }

  /**
   * Perform a teleport requested by `TeleportSystem` (which has no
   * engine reference). Carries the play state to the target scene and
   * plants the arrival tile as a spawn override. A failed teleport (e.g.
   * a missing target map) would otherwise leave the player mid-transition
   * with no scene switch, so it surfaces as an engine `ERROR` rather than
   * a console warning.
   */
  teleport(targetMapId: string, targetTileX: number, targetTileY: number, facing?: Facing): void {
    this.loadMap(targetMapId, {
      spawnOverride: { tileX: targetTileX, tileY: targetTileY, facing },
      keepRuntimeMode: true,
      keepZoom: true,
    }).catch((err) => {
      this.logger.error(`teleport to "${targetMapId}" failed:`, formatError(err))
      this.host.events.emit(EngineEvent.ERROR, {
        message: `Teleport to "${targetMapId}" failed`,
        cause: err instanceof Error ? err : new Error(String(err)),
      })
    })
  }
}

/**
 * Flatten `gameSystems[id].config` into the per-system settings bag the
 * scene hands each system's `runtime(ctx)`.
 */
function gameSystemConfigOf(
  projectData?: { gameSystems?: Record<string, { config?: Record<string, unknown> }> } | null,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const [id, entry] of Object.entries(projectData?.gameSystems ?? {})) out[id] = entry.config ?? {}
  return out
}
