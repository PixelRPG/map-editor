import type Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import { APPLICATION_ID } from '../constants.ts'
import { coerceUiTier, DEFAULT_UI_TIER, isFullView, tierForFullView, type UiTier } from './ui-tier.ts'

/**
 * Owns the view tier: persists it in GSettings (key `ui-tier`, enum
 * `simple` | `full`) and exposes it as the one boolean the UI binds to,
 * `full-view`. Falls back to a non-persistent in-memory tier when the
 * schema is unavailable so the app still starts (with a warning) in
 * unpackaged environments — every launch then begins in Simple view.
 *
 * `full-view` is a GObject property so the stateful `app.full-view`
 * action, the Preferences switch and the window's own `full-view`
 * property all stay in step through `notify::full-view`; an external
 * write (dconf, a second window) propagates through the settings
 * `changed::ui-tier` signal. Same shape as `ThemeService`.
 */
export class UiTierService extends GObject.Object {
  static {
    GObject.registerClass(
      {
        GTypeName: 'UiTierService',
        Properties: {
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full view',
            'Whether the editor shows everything (Full view) or the Simple-view subset',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      UiTierService,
    )
  }

  private settings: Gio.Settings | null = null

  /** In-memory tier used only when the schema is unavailable. */
  private fallbackTier: UiTier = DEFAULT_UI_TIER

  /**
   * Resolve the settings backend. Call once from Application startup with
   * the app's shared `Gio.Settings` (or `null` when the schema is missing).
   */
  init(settings: Gio.Settings | null): void {
    this.settings = settings
    if (settings) {
      // notify rides the settings signal so external writes take the same path.
      settings.connect('changed::ui-tier', () => this.notify('full-view'))
    } else {
      console.warn(`[UiTierService] GSettings schema "${APPLICATION_ID}" not found — the view tier will not persist`)
    }
    // Sync consumers wired before init (the stateful app.full-view action).
    this.notify('full-view')
  }

  /** The persisted tier nick. */
  get tier(): UiTier {
    if (!this.settings) return this.fallbackTier
    return coerceUiTier(this.settings.get_string('ui-tier'))
  }

  set tier(value: UiTier) {
    if (value === this.tier) return
    if (this.settings) {
      this.settings.set_string('ui-tier', value)
      return
    }
    this.fallbackTier = value
    this.notify('full-view')
  }

  get fullView(): boolean {
    return isFullView(this.tier)
  }

  set fullView(value: boolean) {
    this.tier = tierForFullView(value)
  }
}
