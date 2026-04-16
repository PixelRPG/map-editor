import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import { Engine } from '@pixelrpg/engine-gjs'
import { EngineEvent, EngineStatus } from '@pixelrpg/engine-excalibur'
import { GameProjectResource, SpriteSheet } from '@pixelrpg/ui-gjs/sprite'
import { Sidebar } from './sidebar.ts'

import Template from './project-view.blp'

// Ensure the Engine GType is registered before any template that references
// `$Engine` is instantiated.
GObject.type_ensure(Engine.$gtype)

export class ProjectView extends Adw.Bin {
  declare _sidebar: Sidebar | undefined
  declare _engine: Engine | undefined
  declare _splitView: Adw.OverlaySplitView | undefined
  declare _showSidebarButton: Gtk.ToggleButton | undefined

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

    this._engine?.connect(
      EngineEvent.STATUS_CHANGED,
      (_source: Engine, status: EngineStatus) => {
        console.log('[ProjectView] Engine status changed:', status)
      },
    )

    this._engine?.connect(
      EngineEvent.PROJECT_LOADED,
      async (_source: Engine, projectId: string) => {
        console.log('[ProjectView] Project loaded:', projectId)
        await this._onProjectLoaded(projectId)
      },
    )

    this._engine?.connect(
      EngineEvent.MAP_LOADED,
      async (_source: Engine, mapId: string) => {
        console.log('[ProjectView] Map loaded:', mapId)
        await this._onMapLoaded(mapId)
      },
    )

    this._engine?.connect(
      EngineEvent.ERROR,
      (_source: Engine, message: string) => {
        console.error('[ProjectView] Engine error:', message)
      },
    )

    this._engine?.connect('ready', () => {
      console.log('[ProjectView] Ready')
      this.emit('ready')
    })
  }

  get engine(): Engine | undefined {
    return this._engine
  }

  get sidebar(): Sidebar | undefined {
    return this._sidebar
  }

  public async loadProject(projectPath: string): Promise<void> {
    try {
      console.log('[ProjectView] Starting parallel project loading:', projectPath)

      this._currentProjectPath = projectPath
      this._gameProjectResource = new GameProjectResource(projectPath, {
        preloadResources: true,
        useGResource: false,
      })

      await this._gameProjectResource.load()
      console.log('[ProjectView] GameProjectResource loaded successfully')
    } catch (error) {
      console.error('[ProjectView] Failed to load GameProjectResource:', error)
      throw error
    }
  }

  private async _onProjectLoaded(projectId: string): Promise<void> {
    console.log('[ProjectView] Engine project loaded:', projectId)
  }

  private async _onMapLoaded(mapId: string): Promise<void> {
    if (!this._gameProjectResource) {
      console.warn('[ProjectView] No GameProjectResource available for map loading')
      return
    }

    try {
      console.log('[ProjectView] Loading map data for:', mapId)

      const mapData = await this._gameProjectResource.getMap(mapId)
      if (!mapData) {
        console.error('[ProjectView] Map not found:', mapId)
        return
      }

      const spriteSheets: SpriteSheet[] = []
      if (mapData.spriteSets) {
        for (const spriteSetRef of mapData.spriteSets) {
          const spriteSetResource =
            await this._gameProjectResource.getSpriteSet(spriteSetRef.id)
          if (spriteSetResource && spriteSetResource.spriteSheet) {
            spriteSheets.push(spriteSetResource.spriteSheet)
          } else {
            console.warn('[ProjectView] SpriteSet or SpriteSheet not found:', spriteSetRef.id)
          }
        }
      }

      console.log('[ProjectView] Loaded map with', spriteSheets.length, 'sprite sheets')

      this._sidebar?.initializeMapData(mapData, spriteSheets)

      if (this._engine) {
        this._syncUIWithDefaults()
        this._connectSidebarSignals()
      }
    } catch (error) {
      console.error('[ProjectView] Failed to load map data:', error)
    }
  }

  private _syncUIWithDefaults(): void {
    if (!this._sidebar || !this._engine) return

    const state = this._engine.getEditorState()
    if (state.tool && this._sidebar?.mapEditorPanel) {
      this._sidebar.mapEditorPanel.setInitialTool(state.tool as 'brush' | 'eraser')
    }
  }

  private _connectSidebarSignals(): void {
    if (!this._sidebar || !this._engine) return

    this._sidebar.connect('tile-selected', (_sidebar, tileId) => {
      this._engine!.setEditorState({ tileId })
    })

    this._sidebar.connect('tool-changed', (_sidebar, tool) => {
      this._engine!.setEditorState({ tool: tool as 'brush' | 'eraser' })
    })

    this._sidebar.connect('layer-selected', (_sidebar, layerId) => {
      this._engine!.setEditorState({ layerId })
    })
  }
}

GObject.type_ensure(ProjectView.$gtype)
