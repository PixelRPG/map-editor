import Adw from '@girs/adw-1'
import type { GameProjectResource } from '@pixelrpg/engine'
import GObject from '@girs/gobject-2.0'
import {
  AtlasCanvas,
  type EditorMode,
  ModeRail,
  SAMPLE_SCENES,
  type SampleScene,
  SAMPLE_TELEPORTS,
  type SampleTeleport,
  SceneInspector,
  SignalScope,
} from '@pixelrpg/gjs'

import Template from './atlas-view.blp'

GObject.type_ensure(ModeRail.$gtype)
GObject.type_ensure(AtlasCanvas.$gtype)
GObject.type_ensure(SceneInspector.$gtype)

/**
 * Maker-app **Atlas** view — composes the mode rail, atlas canvas, and
 * scene inspector into the desktop Adwaita split-view layout described
 * in the design handoff.
 *
 * Outer `Adw.NavigationSplitView` holds the mode rail; the inner
 * `Adw.OverlaySplitView` keeps the scene inspector pinned to the
 * trailing edge but lets it collapse on narrow widths.
 *
 * Emits `scene-opened::<id>` so the application window can swap to the
 * scene editor view.
 */
export class AtlasView extends Adw.Bin {
  declare _mode_rail: ModeRail
  declare _atlas: AtlasCanvas
  declare _inspector: SceneInspector

  private signals = new SignalScope()
  private _scenes: SampleScene[] = SAMPLE_SCENES
  private _teleports: SampleTeleport[] = SAMPLE_TELEPORTS
  private _projectName = SAMPLE_SCENES.length ? "Aria's Quest" : 'New Project'
  private _collapsed = false
  private _showLibrary = true
  private _showInspector = true
  private _projectResource: GameProjectResource | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'AtlasView',
        Template,
        InternalChildren: ['mode_rail', 'atlas', 'inspector'],
        Properties: {
          'project-name': GObject.ParamSpec.string(
            'project-name',
            'Project Name',
            'Name shown in the header window title',
            GObject.ParamFlags.READWRITE,
            'New Project',
          ),
          collapsed: GObject.ParamSpec.boolean(
            'collapsed',
            'Collapsed',
            'Whether both split views collapse to overlays (driven by the window breakpoint)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'show-library': GObject.ParamSpec.boolean(
            'show-library',
            'Show library',
            'Whether the library mode rail is visible',
            GObject.ParamFlags.READWRITE,
            true,
          ),
          'show-inspector': GObject.ParamSpec.boolean(
            'show-inspector',
            'Show inspector',
            'Whether the right-side scene inspector is visible',
            GObject.ParamFlags.READWRITE,
            true,
          ),
        },
        Signals: {
          'scene-opened': { param_types: [GObject.TYPE_STRING] },
          'scene-selected': { param_types: [GObject.TYPE_STRING] },
          'scene-moved': {
            param_types: [GObject.TYPE_STRING, GObject.TYPE_INT, GObject.TYPE_INT],
          },
          'mode-changed': { param_types: [GObject.TYPE_STRING] },
        },
      },
      AtlasView,
    )
  }

  constructor() {
    super()
    this._mode_rail.projectName = this._projectName
    this._mode_rail.projectTagline = 'Atlas view'
    this._atlas.setWorld(this._scenes, this._teleports)
    this._inspector.setScene(null, this._scenes, this._teleports)
  }

  get projectName(): string {
    return this._projectName ?? ''
  }

  set projectName(value: string) {
    if (this._projectName === value) return
    this._projectName = value
    this._mode_rail.projectName = value
    this.notify('project-name')
  }

  get collapsed(): boolean {
    return this._collapsed ?? false
  }

  set collapsed(value: boolean) {
    if (this._collapsed === value) return
    this._collapsed = value
    this.notify('collapsed')
  }

  get showLibrary(): boolean {
    return this._showLibrary ?? true
  }

  set showLibrary(value: boolean) {
    if (this._showLibrary === value) return
    this._showLibrary = value
    this.notify('show-library')
  }

  get showInspector(): boolean {
    return this._showInspector ?? true
  }

  set showInspector(value: boolean) {
    if (this._showInspector === value) return
    this._showInspector = value
    this.notify('show-inspector')
  }

  /**
   * Replace the demo world with a real project's data. Optionally pass
   * the loaded `GameProjectResource` so atlas cards + the scene
   * inspector can render real tile previews of each map.
   */
  setWorld(
    scenes: SampleScene[],
    teleports: SampleTeleport[],
    projectResource: GameProjectResource | null = null,
  ): void {
    this._scenes = scenes
    this._teleports = teleports
    this._projectResource = projectResource
    this._atlas.setWorld(scenes, teleports, projectResource)
    this._inspector.setScene(null, scenes, teleports, projectResource)
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._atlas, 'scene-selected', (_a: AtlasCanvas, id: string) => {
      const scene = this._scenes.find((s) => s.id === id) ?? null
      this._inspector.setScene(scene, this._scenes, this._teleports, this._projectResource)
      this.emit('scene-selected', id)
    })
    this.signals.connect(this._atlas, 'scene-opened', (_a: AtlasCanvas, id: string) => {
      this.emit('scene-opened', id)
    })
    this.signals.connect(this._atlas, 'scene-moved', (_a: AtlasCanvas, id: string, x: number, y: number) => {
      this.emit('scene-moved', id, x, y)
    })
    this.signals.connect(this._mode_rail, 'mode-changed', (_r: ModeRail, mode: string) => {
      this.emit('mode-changed', mode as EditorMode)
    })
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(AtlasView.$gtype)
