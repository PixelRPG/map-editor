import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type { GameProjectResource } from '@pixelrpg/engine'
import {
  AtlasCanvas,
  type EditorMode,
  FloatingFab,
  ModeRail,
  SAMPLE_SCENES,
  SAMPLE_TELEPORTS,
  type SampleScene,
  type SampleTeleport,
  SceneInspector,
  SignalScope,
} from '@pixelrpg/gjs'

import Template from './atlas-view.blp'

GObject.type_ensure(ModeRail.$gtype)
GObject.type_ensure(AtlasCanvas.$gtype)
GObject.type_ensure(SceneInspector.$gtype)
GObject.type_ensure(FloatingFab.$gtype)

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
  private _libraryCollapsed = false
  private _inspectorCollapsed = false
  private _showLibrary = false
  private _showInspector = false
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
          // Per-sidebar collapse flags so the window breakpoint
          // can independently switch each into drawer mode. See
          // `scene-editor-view.ts` for the rationale.
          'library-collapsed': GObject.ParamSpec.boolean(
            'library-collapsed',
            'Library Collapsed',
            'Whether the left library sidebar collapses to an overlay (set by the window breakpoint)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'inspector-collapsed': GObject.ParamSpec.boolean(
            'inspector-collapsed',
            'Inspector Collapsed',
            'Whether the right scene-inspector sidebar collapses to an overlay (set by the window breakpoint)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'show-library': GObject.ParamSpec.boolean(
            'show-library',
            'Show library',
            'Whether the library mode rail is visible',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'show-inspector': GObject.ParamSpec.boolean(
            'show-inspector',
            'Show inspector',
            'Whether the right-side scene inspector is visible',
            GObject.ParamFlags.READWRITE,
            false,
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

  /** Push the active mode-rail row from the host on every view switch. */
  syncActiveMode(mode: EditorMode): void {
    this._mode_rail.activeMode = mode
  }

  get libraryCollapsed(): boolean {
    return this._libraryCollapsed ?? false
  }

  set libraryCollapsed(value: boolean) {
    if (this._libraryCollapsed === value) return
    this._libraryCollapsed = value
    this.notify('library-collapsed')
  }

  get inspectorCollapsed(): boolean {
    return this._inspectorCollapsed ?? false
  }

  set inspectorCollapsed(value: boolean) {
    if (this._inspectorCollapsed === value) return
    this._inspectorCollapsed = value
    this.notify('inspector-collapsed')
  }

  get showLibrary(): boolean {
    return this._showLibrary ?? false
  }

  set showLibrary(value: boolean) {
    if (this._showLibrary === value) return
    this._showLibrary = value
    this.notify('show-library')
  }

  get showInspector(): boolean {
    return this._showInspector ?? false
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

  /**
   * Shared selection write — used by both `scene-selected` (click)
   * and `scene-drag-began` (drag-start). Refreshes the inspector
   * content + forwards the selection upward to the application
   * window. Does NOT touch `showInspector` — auto-open is a per-
   * call-site decision (only the click path opens; drag-start
   * stays silent).
   */
  private _refreshSelectedScene(id: string): void {
    const scene = this._scenes.find((s) => s.id === id) ?? null
    this._inspector.setScene(scene, this._scenes, this._teleports, this._projectResource)
    this.emit('scene-selected', id)
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._atlas, 'scene-selected', (_a: AtlasCanvas, id: string) => {
      this._refreshSelectedScene(id)
      // Auto-open the right inspector on a CLICK-only selection —
      // per the project-wide policy in
      // `docs/concepts/responsive-chrome.md`. Drag-start selections
      // arrive via `scene-drag-began` and intentionally skip the
      // auto-open (the overlay drawer would cover the canvas mid-
      // drag on smartphone widths). Setter is a no-op when already
      // open, and the `inspector-collapsed` breakpoint setter on
      // `application-window.blp` means the same write surfaces as
      // an overlay drawer on mobile / tablet widths — no responsive
      // branching needed here.
      this.showInspector = true
    })
    this.signals.connect(this._atlas, 'scene-drag-began', (_a: AtlasCanvas, id: string) => {
      // Drag-start IS a selection (the inspector content should
      // refresh to the dragged scene so a desktop user can read
      // its metadata in the persistent panel), but it MUST NOT
      // trigger auto-open. Documented under "Auto-open policy →
      // exemptions" in `docs/concepts/responsive-chrome.md`.
      this._refreshSelectedScene(id)
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
