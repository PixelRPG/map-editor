import type Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import { APPLICATION_ID } from '../constants.ts'

/** The `show-grid-default` key's value when the schema is unavailable. */
export const DEFAULT_SHOW_GRID = false

/**
 * Owns the editing defaults a new session starts from — today just the
 * tile grid (GSettings key `show-grid-default`, REDESIGN.md § 4.8's
 * Editing group). Falls back to a non-persistent in-memory value when
 * the schema is unavailable so the app still starts (with a warning) in
 * unpackaged environments. Same shape as `ThemeService` / `UiTierService`.
 *
 * A DEFAULT, not a mirror of `win.toggle-grid`: the action's state is
 * per-session and the user flips it constantly while aligning tiles, so
 * binding the two would rewrite the preference on every keystroke of
 * `<Primary>G`. The window reads this once, when it installs the action.
 *
 * `show-grid` is a GObject property so the Preferences switch and any
 * external write (dconf, a second window) meet at the same place, via
 * `notify::show-grid` and the settings `changed::show-grid-default`
 * signal.
 */
export class EditorDefaultsService extends GObject.Object {
  static {
    GObject.registerClass(
      {
        GTypeName: 'EditorDefaultsService',
        Properties: {
          'show-grid': GObject.ParamSpec.boolean(
            'show-grid',
            'Show grid',
            'Whether the tile grid is on when a map editing session starts',
            GObject.ParamFlags.READWRITE,
            DEFAULT_SHOW_GRID,
          ),
        },
      },
      EditorDefaultsService,
    )
  }

  private settings: Gio.Settings | null = null

  /** In-memory value used only when the schema is unavailable. */
  private fallbackShowGrid = DEFAULT_SHOW_GRID

  /**
   * Resolve the settings backend. Call once from Application startup with
   * the app's shared `Gio.Settings` (or `null` when the schema is missing).
   */
  init(settings: Gio.Settings | null): void {
    this.settings = settings
    if (settings) {
      // notify rides the settings signal so external writes take the same path.
      settings.connect('changed::show-grid-default', () => this.notify('show-grid'))
    } else {
      console.warn(
        `[EditorDefaultsService] GSettings schema "${APPLICATION_ID}" not found — editing defaults will not persist`,
      )
    }
    // Sync consumers wired before init.
    this.notify('show-grid')
  }

  get showGrid(): boolean {
    if (!this.settings) return this.fallbackShowGrid
    return this.settings.get_boolean('show-grid-default')
  }

  set showGrid(value: boolean) {
    if (value === this.showGrid) return
    if (this.settings) {
      this.settings.set_boolean('show-grid-default', value)
      return
    }
    this.fallbackShowGrid = value
    this.notify('show-grid')
  }
}
