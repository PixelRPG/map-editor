import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import { Engine } from '@pixelrpg/engine-gjs'
import { EngineStatus, EngineEventType } from '@pixelrpg/engine-core'
import { Sidebar } from './sidebar.ts'

import Template from './project-view.blp'

export class ProjectView extends Adw.Bin {
  // GObject internal children
  declare _sidebar: Sidebar | undefined
  declare _engine: Engine | undefined
  declare _splitView: Adw.OverlaySplitView | undefined
  declare _showSidebarButton: Gtk.ToggleButton | undefined

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
      (_source: Engine, projectId: string) => {
        console.log('[ProjectView] Project loaded:', projectId)
      },
    )

    this._engine?.connect(
      EngineEventType.MAP_LOADED,
      (_source: Engine, mapId: string) => {
        console.log('[ProjectView] Map loaded:', mapId)
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
}

GObject.type_ensure(ProjectView.$gtype)
