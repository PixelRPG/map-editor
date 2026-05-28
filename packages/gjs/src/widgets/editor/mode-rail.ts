import Adw from '@girs/adw-1'
import type Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { ProjectHeroIcon } from './project-hero-icon'

import Template from './mode-rail.blp'

GObject.type_ensure(ProjectHeroIcon.$gtype)

/**
 * Editor mode discriminator emitted by {@link ModeRail}.
 */
export type EditorMode = 'world' | 'cast' | 'tiles' | 'audio' | 'data'

const MODE_ORDER: EditorMode[] = ['world', 'cast', 'tiles', 'audio', 'data']

/**
 * Library mode rail — the editor's primary navigation column.
 *
 * Hosts a hero block (project name + tagline + {@link ProjectHeroIcon})
 * followed by an `Adw.PreferencesGroup` of mode rows. Selection drives
 * `mode-changed::<mode>` and accents the matching row.
 *
 * Rows are wired to the `win.mode` action with a string target, so the
 * containing window can also flip modes via keyboard shortcuts.
 */
export class ModeRail extends Adw.Bin {
  declare _hero_icon: ProjectHeroIcon
  declare _project_name: Gtk.Label
  declare _project_tagline: Gtk.Label
  declare _row_world: Adw.ActionRow
  declare _row_cast: Adw.ActionRow
  declare _row_tiles: Adw.ActionRow
  declare _row_audio: Adw.ActionRow
  declare _row_data: Adw.ActionRow

  private _activeMode: EditorMode = 'world'
  private _projectName = ''
  private _projectTagline = ''
  /** Handler id of the `win.mode` action's `notify::state` connection,
   * stored so we can disconnect on `unroot`. Zero when not connected. */
  private _modeActionHandlerId = 0
  /** Cached reference so disconnect uses the exact action we connected
   * to (lookup_action returns a different proxy on each call). */
  private _observedModeAction: Gio.SimpleAction | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgModeRail',
        Template,
        InternalChildren: [
          'hero_icon',
          'project_name',
          'project_tagline',
          'row_world',
          'row_cast',
          'row_tiles',
          'row_audio',
          'row_data',
        ],
        Properties: {
          'project-name': GObject.ParamSpec.string(
            'project-name',
            'Project Name',
            'Name displayed in the hero block',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'project-tagline': GObject.ParamSpec.string(
            'project-tagline',
            'Project Tagline',
            'Sub-line shown beneath the project name',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'active-mode': GObject.ParamSpec.string(
            'active-mode',
            'Active Mode',
            'Currently selected editor mode',
            GObject.ParamFlags.READWRITE,
            'world',
          ),
        },
        Signals: {
          'mode-changed': { param_types: [GObject.TYPE_STRING] },
        },
      },
      ModeRail,
    )
  }

  constructor(params: Partial<{ projectName: string; projectTagline: string; activeMode: EditorMode }> = {}) {
    super()
    if (params.projectName !== undefined) this.projectName = params.projectName
    if (params.projectTagline !== undefined) this.projectTagline = params.projectTagline
    if (params.activeMode !== undefined) this.activeMode = params.activeMode

    this._connectRows()
    this._refreshHighlight()
  }

  get projectName(): string {
    return this._projectName ?? ''
  }

  set projectName(value: string) {
    if (this._projectName === value) return
    this._projectName = value
    this.notify('project-name')
  }

  get projectTagline(): string {
    return this._projectTagline ?? ''
  }

  set projectTagline(value: string) {
    if (this._projectTagline === value) return
    this._projectTagline = value
    this.notify('project-tagline')
    if (this._project_tagline) this._project_tagline.set_visible(value.length > 0)
  }

  get activeMode(): EditorMode {
    return this._activeMode ?? 'world'
  }

  set activeMode(value: EditorMode) {
    if (this._activeMode === value) return
    if (!MODE_ORDER.includes(value)) return
    this._activeMode = value
    this.notify('active-mode')
    this._refreshHighlight()
  }

  private _rowForMode(mode: EditorMode): Adw.ActionRow {
    switch (mode) {
      case 'world':
        return this._row_world
      case 'cast':
        return this._row_cast
      case 'tiles':
        return this._row_tiles
      case 'audio':
        return this._row_audio
      case 'data':
        return this._row_data
    }
  }

  private _connectRows(): void {
    for (const mode of MODE_ORDER) {
      const row = this._rowForMode(mode)
      row.connect('activated', () => {
        this.activeMode = mode
        this.emit('mode-changed', mode)
      })
    }
  }

  private _refreshHighlight(): void {
    for (const mode of MODE_ORDER) {
      const row = this._rowForMode(mode)
      if (mode === this._activeMode) {
        row.add_css_class('accent')
      } else {
        row.remove_css_class('accent')
      }
    }
  }

  // Mode-rail instances are hosted by Atlas / Cast / Tiles / Scene
  // editor views — each gets its OWN ModeRail. Without an observer
  // here, a navigation that doesn't pass through the rail's own row
  // click (e.g. opening a scene from the atlas, or a programmatic
  // `_setView` from the host) would leave every other rail's
  // `_activeMode` stale, so all rails kept showing "World" as active.
  //
  // Observing `win.mode` directly closes the loop without any
  // routing-side awareness — every rail in any window stays in sync
  // with whichever mode the window's action group currently advertises.
  vfunc_root(): void {
    super.vfunc_root()
    const root = this.get_root() as (Gtk.Window & { lookup_action?: (name: string) => Gio.Action | null }) | null
    const action = root?.lookup_action?.('mode') as Gio.SimpleAction | null
    if (!action) return
    this._observedModeAction = action
    this._syncFromAction(action)
    this._modeActionHandlerId = action.connect('notify::state', () => {
      if (this._observedModeAction) this._syncFromAction(this._observedModeAction)
    })
  }

  vfunc_unroot(): void {
    if (this._observedModeAction && this._modeActionHandlerId !== 0) {
      this._observedModeAction.disconnect(this._modeActionHandlerId)
    }
    this._modeActionHandlerId = 0
    this._observedModeAction = null
    super.vfunc_unroot()
  }

  private _syncFromAction(action: Gio.SimpleAction): void {
    const state = action.get_state()
    if (!state) return
    const value = state.get_string()[0] as EditorMode | undefined
    if (value && MODE_ORDER.includes(value)) {
      this.activeMode = value
    }
  }
}

GObject.type_ensure(ModeRail.$gtype)
