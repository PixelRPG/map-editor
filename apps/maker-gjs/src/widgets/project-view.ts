import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import { Engine } from '@pixelrpg/engine-gjs'
import { EngineStatus, EngineEventType } from '@pixelrpg/engine-core'
import { GameProjectResource, SpriteSheet } from '@pixelrpg/data-gjs'
import { MapData, SpriteSetData } from '@pixelrpg/data-core'
import { Sidebar } from './sidebar.ts'

import Template from './project-view.blp'

export class ProjectView extends Adw.Bin {
  // GObject internal children
  declare _sidebar: Sidebar | undefined
  declare _engine: Engine | undefined
  declare _splitView: Adw.OverlaySplitView | undefined
  declare _showSidebarButton: Gtk.ToggleButton | undefined

  // Project management
  private _gameProjectResource: GameProjectResource | null = null
  private _currentProjectPath: string | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'ProjectView',
        Template,
        InternalChildren: [
          'sidebar',
          'engine',
          'splitView',
          'showSidebarButton',
        ],
        Signals: {
          ready: {},
        },
      },
      this,
    )
  }

  constructor() {
    super()

    // Connect to engine event signals
    this._engine?.connect(
      EngineEventType.STATUS_CHANGED,
      (_source: Engine, status: EngineStatus) => {
        console.log('[ProjectView] Engine status changed:', status)
      },
    )

    this._engine?.connect(
      EngineEventType.PROJECT_LOADED,
      async (_source: Engine, projectId: string) => {
        console.log('[ProjectView] Project loaded:', projectId)
        await this._onProjectLoaded(projectId)
      },
    )

    this._engine?.connect(
      EngineEventType.MAP_LOADED,
      async (_source: Engine, mapId: string) => {
        console.log('[ProjectView] Map loaded:', mapId)
        await this._onMapLoaded(mapId)
      },
    )

    this._engine?.connect(
      EngineEventType.ERROR,
      (_source: Engine, message: string, error: Error | null) => {
        console.error('[ProjectView] Engine error:', message, error)
      },
    )

    this._engine?.connect('ready', () => {
      console.log('[ProjectView] Ready')
      this.emit('ready')
    })
  }

  /**
   * Get the engine view
   */
  get engine(): Engine | undefined {
    return this._engine
  }

  /**
   * Get the sidebar
   */
  get sidebar(): Sidebar | undefined {
    return this._sidebar
  }

  /**
   * Handle project loaded event
   * @param projectId The ID of the loaded project
   */
  private async _onProjectLoaded(projectId: string): Promise<void> {
    try {
      // For now, we need to derive the project path from the projectId
      // This is a limitation of the current engine interface
      // In a real implementation, the engine should provide the project path
      const projectPath = `${projectId}.json` // This is a simplification

      console.log(
        '[ProjectView] Creating GameProjectResource for:',
        projectPath,
      )

      this._currentProjectPath = projectPath
      this._gameProjectResource = new GameProjectResource(projectPath, {
        preloadResources: true,
        useGResource: false,
      })

      // Load the project data and preload sprite sets
      await this._gameProjectResource.load()

      console.log('[ProjectView] GameProjectResource loaded successfully')
    } catch (error) {
      console.error('[ProjectView] Failed to load GameProjectResource:', error)
    }
  }

  /**
   * Handle map loaded event
   * @param mapId The ID of the loaded map
   */
  private async _onMapLoaded(mapId: string): Promise<void> {
    if (!this._gameProjectResource) {
      console.warn(
        '[ProjectView] No GameProjectResource available for map loading',
      )
      return
    }

    try {
      console.log('[ProjectView] Loading map data for:', mapId)

      // Load the map data
      const mapData = await this._gameProjectResource.getMap(mapId)
      if (!mapData) {
        console.error('[ProjectView] Map not found:', mapId)
        return
      }

      // Load the sprite sheets referenced by the map
      const spriteSheets: SpriteSheet[] = []
      if (mapData.spriteSets) {
        for (const spriteSetRef of mapData.spriteSets) {
          const spriteSetResource =
            await this._gameProjectResource.getSpriteSet(spriteSetRef.id)
          if (spriteSetResource && spriteSetResource.spriteSheet) {
            spriteSheets.push(spriteSetResource.spriteSheet)
          } else {
            console.warn(
              '[ProjectView] SpriteSet or SpriteSheet not found:',
              spriteSetRef.id,
            )
          }
        }
      }

      console.log(
        '[ProjectView] Loaded map with',
        spriteSheets.length,
        'sprite sheets',
      )

      // Initialize the sidebar with the map data
      this._sidebar?.initializeMapData(mapData, spriteSheets)
    } catch (error) {
      console.error('[ProjectView] Failed to load map data:', error)
    }
  }
}

GObject.type_ensure(ProjectView.$gtype)
