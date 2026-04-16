import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import { Engine, SpriteSetResource, type SpriteSheet } from '@pixelrpg/gjs'
import { EngineEvent, type EngineStatus } from '@pixelrpg/engine'
import { Sidebar } from './sidebar.ts'

import Template from './project-view.blp'

GObject.type_ensure(Engine.$gtype)

export class ProjectView extends Adw.Bin {
  declare _sidebar: Sidebar | undefined
  declare _engine: Engine | undefined
  declare _splitView: Adw.OverlaySplitView | undefined
  declare _showSidebarButton: Gtk.ToggleButton | undefined

  private _previewSpriteSheets = new Map<string, SpriteSheet>()

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

  private async _onMapLoaded(mapId: string): Promise<void> {
    const resource = this._engine?.excalibur?.gameProjectResource
    if (!resource) {
      console.warn('[ProjectView] Engine has no gameProjectResource yet')
      return
    }

    const mapData = await resource.getMap(mapId)
    if (!mapData) {
      console.error('[ProjectView] Map not found:', mapId)
      return
    }

    const spriteSheets: SpriteSheet[] = []
    if (mapData.spriteSets) {
      for (const spriteSetRef of mapData.spriteSets) {
        try {
          let sheet = this._previewSpriteSheets.get(spriteSetRef.id)
          if (!sheet) {
            // SpriteSet paths in MapData are relative to the map file, not the
            // project file. Reuse the already-loaded engine SpriteSetResource's
            // absolute path instead of re-resolving against the project root.
            const engineSet = await resource.getSpriteSet(spriteSetRef.id)
            if (!engineSet) {
              console.warn(
                `[ProjectView] Engine has no sprite set for ${spriteSetRef.id}`,
              )
              continue
            }
            const setResource = new SpriteSetResource(engineSet.path)
            await setResource.load()
            if (setResource.spriteSheet) {
              sheet = setResource.spriteSheet
              this._previewSpriteSheets.set(spriteSetRef.id, sheet)
            }
          }
          if (sheet) spriteSheets.push(sheet)
        } catch (error) {
          console.warn(
            `[ProjectView] Failed to load sprite set ${spriteSetRef.id}:`,
            error,
          )
        }
      }
    }

    this._sidebar?.initializeMapData(mapData, spriteSheets)

    if (this._engine) {
      this._syncUIWithDefaults()
      this._connectSidebarSignals()
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
