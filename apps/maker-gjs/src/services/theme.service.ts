import Adw from '@girs/adw-1'
import type Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import { APPLICATION_ID } from '../constants.ts'
import { lookupAppSettings } from './app-settings.ts'
import { coerceThemePreference, type ThemePreference } from './theme-preference.ts'

/** Map a persisted preference onto libadwaita's color-scheme request. */
export function colorSchemeForTheme(theme: ThemePreference): Adw.ColorScheme {
  switch (theme) {
    case 'force-light':
      return Adw.ColorScheme.FORCE_LIGHT
    case 'force-dark':
      return Adw.ColorScheme.FORCE_DARK
    default:
      return Adw.ColorScheme.DEFAULT
  }
}

/**
 * Owns the auto/light/dark preference: persists it in GSettings (key
 * `theme`) and drives `Adw.StyleManager` accordingly. Falls back to a
 * non-persistent in-memory preference when the schema is unavailable so
 * the app still starts (with a warning) in unpackaged environments.
 *
 * Exposes `theme` as a GObject property so preference UIs and the
 * stateful `app.theme` action stay in sync via `notify::theme` — external
 * changes (dconf, another window) propagate through the settings
 * `changed::theme` signal.
 */
export class ThemeService extends GObject.Object {
  static {
    GObject.registerClass(
      {
        GTypeName: 'ThemeService',
        Properties: {
          theme: GObject.ParamSpec.string(
            'theme',
            'Theme',
            'Color-scheme preference nick (default | force-light | force-dark)',
            GObject.ParamFlags.READWRITE,
            'default',
          ),
        },
      },
      ThemeService,
    )
  }

  private settings: Gio.Settings | null = null

  /** In-memory preference used only when the schema is unavailable. */
  private fallbackTheme: ThemePreference = 'default'

  /**
   * Resolve the settings backend and apply the persisted preference.
   * Call once from Application startup (libadwaita must be initialized
   * before the style manager is touched).
   */
  init(settings: Gio.Settings | null = lookupAppSettings()): void {
    this.settings = settings
    if (settings) {
      settings.connect('changed::theme', () => {
        this.notify('theme')
        this.apply()
      })
    } else {
      console.warn(`[ThemeService] GSettings schema "${APPLICATION_ID}" not found — theme preference will not persist`)
    }
    // Sync consumers wired before init (the stateful app.theme action).
    this.notify('theme')
    this.apply()
  }

  get theme(): ThemePreference {
    if (!this.settings) return this.fallbackTheme
    return coerceThemePreference(this.settings.get_string('theme'))
  }

  set theme(value: ThemePreference) {
    if (value === this.theme) return
    if (this.settings) {
      // notify + apply ride the settings `changed::theme` signal so
      // external writes take the same path.
      this.settings.set_string('theme', value)
      return
    }
    this.fallbackTheme = value
    this.notify('theme')
    this.apply()
  }

  private apply(): void {
    Adw.StyleManager.get_default().set_color_scheme(colorSchemeForTheme(this.theme))
  }
}
