import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { EngineEvent, type EngineStatus } from '@pixelrpg/engine'
import { Engine, GdkSpriteSetResource, type GdkSpriteSheet, SignalScope } from '@pixelrpg/gjs'
import Template from './project-view.blp'
import type { Sidebar } from './sidebar.ts'

GObject.type_ensure(Engine.$gtype)

export class ProjectView extends Adw.Bin {
  declare _sidebar: Sidebar | undefined
  declare _engine: Engine | undefined
  declare _splitView: Adw.OverlaySplitView | undefined
  declare _showSidebarButton: Gtk.ToggleButton | undefined

  private _previewSpriteSheets = new Map<string, GdkSpriteSheet>()
  private signals = new SignalScope()
  private _sidebarConnected = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'ProjectView',
        Template,
        InternalChildren: ['sidebar', 'engine', 'splitView', 'showSidebarButton'],
        Signals: {
          ready: {},
        },
      },
      ProjectView,
    )
  }

  vfunc_map(): void {
    super.vfunc_map()

    if (this._engine) {
      this.signals.connect(this._engine, EngineEvent.STATUS_CHANGED, (_source: Engine, status: EngineStatus) => {
        console.log('[ProjectView] Engine status changed:', status)
      })

      this.signals.connect(this._engine, EngineEvent.PROJECT_LOADED, async (_source: Engine, projectId: string) => {
        console.log('[ProjectView] Project loaded:', projectId)
      })

      this.signals.connect(this._engine, EngineEvent.MAP_LOADED, async (_source: Engine, mapId: string) => {
        console.log('[ProjectView] Map loaded:', mapId)
        await this._onMapLoaded(mapId)
      })

      this.signals.connect(this._engine, EngineEvent.ERROR, (_source: Engine, message: string) => {
        console.error('[ProjectView] Engine error:', message)
      })

      this.signals.connect(this._engine, 'ready', () => {
        console.log('[ProjectView] Ready')
        this.emit('ready')
      })
    }
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    this._sidebarConnected = false
    super.vfunc_unmap()
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

    const spriteSheets: GdkSpriteSheet[] = []
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
              console.warn(`[ProjectView] Engine has no sprite set for ${spriteSetRef.id}`)
              continue
            }
            const setResource = await GdkSpriteSetResource.fromEngineResource(engineSet)
            if (setResource.spriteSheet) {
              sheet = setResource.spriteSheet
              this._previewSpriteSheets.set(spriteSetRef.id, sheet)
            }
          }
          if (sheet) spriteSheets.push(sheet)
        } catch (error) {
          console.warn(`[ProjectView] Failed to load sprite set ${spriteSetRef.id}:`, error)
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
    if (!this._sidebar || !this._engine || this._sidebarConnected) return
    this._sidebarConnected = true

    this.signals.connect(this._sidebar, 'tile-selected', (_sidebar: Sidebar, tileId: number) => {
      this._engine!.setEditorState({ tileId })
    })

    this.signals.connect(this._sidebar, 'tool-changed', (_sidebar: Sidebar, tool: string) => {
      this._engine!.setEditorState({ tool: tool as 'brush' | 'eraser' })
    })

    this.signals.connect(this._sidebar, 'layer-selected', (_sidebar: Sidebar, layerId: string) => {
      this._engine!.setEditorState({ layerId })
    })
  }
}

GObject.type_ensure(ProjectView.$gtype)
