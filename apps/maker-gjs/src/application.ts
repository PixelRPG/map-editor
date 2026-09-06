import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { installDevtools } from '@gjsify/devtools'
import applicationStyle from './application.css'
import { APPLICATION_ID, PACKAGE_VERSION, PKGDATADIR, RESOURCES_PATH } from './constants.ts'
import { sanitizeInstanceId } from './instance-id.ts'
import { ControlDbusService } from './services/control-dbus.service.ts'
import { cleanupOrphanedPublishers } from './services/orphan-publisher-cleanup.ts'
import { lookupAppSettings } from './services/app-settings.ts'
import { type PixelrpgIntent, pickPixelrpgIntent } from './services/pixelrpg-url.ts'
import { coerceThemePreference } from './services/theme-preference.ts'
import { ThemeService } from './services/theme.service.ts'
import { UiTierService } from './services/ui-tier.service.ts'
import { ApplicationWindow, PreferencesDialog } from './widgets/index.ts'

export class Application extends Adw.Application {
  /**
   * Intent extracted from a `pixelrpg://...` URL invocation on launch
   * (or any subsequent `command-line` activation while a single
   * instance is already running). Initially null; consumers — the
   * Welcome view today, future SessionService integration tomorrow
   * — call `consumePendingIntent()` once they're ready to act on it
   * so the intent isn't applied twice if the user re-presents the
   * window.
   */
  private pendingIntent: PixelrpgIntent | null = null

  /**
   * Permanent `org.pixelrpg.maker.Control` D-Bus interface (status +
   * screenshot). Exported in {@link onStartup} once the session-bus
   * connection is up, torn down on `shutdown`. Navigation/commands ride
   * the standard `org.gtk.Actions` interface GtkApplication exports for
   * free, so they need no code here.
   */
  private control: ControlDbusService | null = null

  /**
   * Auto/light/dark preference (GSettings `theme` key → Adw.StyleManager).
   * Constructed eagerly so actions can wire against it; the settings
   * backend + style application happen in {@link onStartup} via `init()`
   * once libadwaita is up.
   */
  readonly themeService = new ThemeService()

  /**
   * Simple view / Full view (GSettings `ui-tier` key). Same lifecycle as
   * the theme: constructed eagerly so the stateful `app.full-view` action
   * can wire against it, backed by the shared settings in {@link onStartup}.
   */
  readonly uiTierService = new UiTierService()

  static {
    GObject.registerClass(
      {
        GTypeName: 'Application',
        Signals: {
          'pixelrpg-intent': { param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING] },
        },
      },
      Application,
    )
  }

  constructor() {
    // PIXELRPG_INSTANCE (set only by the devtools orchestrator) gives this
    // process a distinct app-id — and therefore a distinct D-Bus name +
    // Control object path — so several makers can run side by side for
    // collaboration testing. Empty/unset = the normal single instance.
    const instance = GLib.getenv('PIXELRPG_INSTANCE')
    const applicationId = instance ? `${APPLICATION_ID}.${sanitizeInstanceId(instance)}` : APPLICATION_ID
    super({
      applicationId,
      // HANDLES_COMMAND_LINE so the `x-scheme-handler/pixelrpg`
      // .desktop entry can re-dispatch to the running instance
      // when the user clicks `pixelrpg://join/<roomid>` in a
      // browser / chat. `vfunc_command_line` below parses argv
      // for the URL and emits `pixelrpg-intent`.
      flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
    })
    // Pin the resource base path so a per-instance app-id doesn't move
    // where GTK auto-loads resources from (defaults to the app-id path).
    this.set_resource_base_path('/org/pixelrpg/maker')
    this.onStartup = this.onStartup.bind(this)
    this.connect('startup', this.onStartup)
    this.connect('shutdown', () => this.control?.unexport())
    this.initActions()
  }

  protected onStartup(): void {
    this.initResources()
    this.initStyles()
    // One Gio.Settings for both keys; `null` (schema not found) makes
    // both services fall back to in-memory values with a warning.
    const settings = lookupAppSettings()
    this.themeService.init(settings)
    this.uiTierService.init(settings)
    this.initControlInterface()
    // Opt-in @gjsify/devtools control plane (`org.gjsify.Devtools`) — the
    // standard interface `gjsify debug` (MCP) + a `gdbus` Screenshot speak,
    // adding DumpTree/GetProperty/ListActions/DumpCss alongside the app's own
    // `org.pixelrpg.maker.Control`. No-op unless `GJSIFY_DEVTOOLS` is set
    // (`installDevtools` gates on it via `GLib.getenv`), so it is safe to leave
    // in release builds. Guarded so a devtools hiccup never blocks startup.
    try {
      installDevtools(this)
    } catch (error) {
      console.warn(`[Application] @gjsify/devtools setup skipped: ${error}`)
    }
    // Defensive: kill any `avahi-publish-service` subprocess left
    // behind by a previous maker that crashed without invoking
    // `LanPublisher.close()`. Skipped when the scan returns
    // `killed=0` so a clean startup is silent; logged when we
    // actually drop a ghost.
    const cleanup = cleanupOrphanedPublishers()
    if (cleanup.killed > 0) {
      console.log(
        `[Application] cleaned up ${cleanup.killed} orphaned avahi-publish-service subprocess(es) ` +
          `from a previous run (scanned ${cleanup.scanned} pids, ${cleanup.errors} errors)`,
      )
    }
  }

  /**
   * Export the permanent `org.pixelrpg.maker.Control` D-Bus interface so
   * external tooling (the MCP bridge, `gdbus`, scripts) can inspect and
   * screenshot the running editor. Best-effort: skipped when there is no
   * session-bus connection (e.g. launched without a bus). The standard
   * `org.gtk.Actions` interface for `app.*` / `win.*` actions is exported
   * automatically by GtkApplication and needs no code here.
   */
  protected initControlInterface(): void {
    const connection = this.get_dbus_connection()
    const objectPath = this.get_dbus_object_path()
    if (!connection || !objectPath) {
      console.warn('[Application] No D-Bus connection; Control interface not exported')
      return
    }
    try {
      this.control = new ControlDbusService(this)
      this.control.export(connection, `${objectPath}/control`)
      console.log(`[Application] Exported ${objectPath}/control (org.pixelrpg.maker.Control)`)
    } catch (error) {
      console.warn(`[Application] Failed to export Control interface: ${error}`)
    }
  }

  /** Load + register the bundled GResource so app metainfo, icons, etc.
   * resolve under `/org/pixelrpg/maker/…`. */
  protected initResources(): void {
    try {
      const path = `${PKGDATADIR}/${APPLICATION_ID}.data.gresource`
      const resource = Gio.Resource.load(path)
      Gio.resources_register(resource)
    } catch (error) {
      console.warn(`[Application] Failed to register gresource: ${error}`)
    }
  }

  /** Load the stylesheet in a CssProvider and add it to the Gtk.StyleContext */
  protected initStyles() {
    const provider = new Gtk.CssProvider()
    provider.load_from_string(applicationStyle)
    const display = Gdk.Display.get_default()

    if (!display) {
      console.error('No display found')
      return
    }

    Gtk.StyleContext.add_provider_for_display(display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
  }

  initActions() {
    // Quit action
    const quitAction = new Gio.SimpleAction({ name: 'quit' })
    quitAction.connect('activate', (_action) => {
      log('quitAction activated')
      this.quit()
    })
    this.add_action(quitAction)
    this.set_accels_for_action('app.quit', ['<primary>q'])

    // About action
    const showAboutAction = new Gio.SimpleAction({ name: 'about' })
    showAboutAction.connect('activate', (_action) => {
      // Pass `null` as the release version until the metainfo has
      // proper <release> entries; libadwaita falls back to the latest
      // release block (or just the app metadata if there are none).
      const aboutDialog = Adw.AboutDialog.new_from_appdata(
        `${RESOURCES_PATH}/metainfo/${APPLICATION_ID}.metainfo.xml`,
        null,
      )
      aboutDialog.set_version(PACKAGE_VERSION)
      aboutDialog.present(this.get_active_window())
    })
    this.add_action(showAboutAction)

    const showPreferencesAction = new Gio.SimpleAction({ name: 'preferences' })
    showPreferencesAction.connect('activate', (_action) => {
      const preferencesDialog = new PreferencesDialog()
      preferencesDialog.setThemeService(this.themeService)
      preferencesDialog.setUiTierService(this.uiTierService)
      preferencesDialog.present(this.active_window)
    })
    this.add_action(showPreferencesAction)

    // Theme action — stateful radio (Auto / Light / Dark) surfaced in the
    // primary menu; state mirrors the persisted preference both ways.
    const themeAction = Gio.SimpleAction.new_stateful(
      'theme',
      GLib.VariantType.new('s'),
      GLib.Variant.new_string(this.themeService.theme),
    )
    themeAction.connect('activate', (_action, parameter) => {
      this.themeService.theme = coerceThemePreference(parameter?.unpack())
    })
    this.themeService.connect('notify::theme', () => {
      themeAction.set_state(GLib.Variant.new_string(this.themeService.theme))
    })
    this.add_action(themeAction)

    // Full view — a stateful boolean, so the primary menu renders it as a
    // check item and a driver reads it from ListActions. No `activate`
    // handler on purpose: GSimpleAction's default toggles a parameterless
    // boolean action through `change-state`, which is the one path every
    // switch (menu, Preferences, the "Show N more settings" row) takes.
    // State mirrors the persisted tier both ways, like `app.theme`.
    const fullViewAction = Gio.SimpleAction.new_stateful(
      'full-view',
      null,
      GLib.Variant.new_boolean(this.uiTierService.fullView),
    )
    fullViewAction.connect('change-state', (_action, value) => {
      this.uiTierService.fullView = value?.get_boolean() ?? false
    })
    this.uiTierService.connect('notify::full-view', () => {
      fullViewAction.set_state(GLib.Variant.new_boolean(this.uiTierService.fullView))
    })
    this.add_action(fullViewAction)
  }

  vfunc_activate() {
    let { active_window } = this

    if (!active_window) active_window = new ApplicationWindow(this, this.uiTierService)

    active_window.present()
  }

  /**
   * Handle command-line activations — both the initial launch and
   * any subsequent invocation while the app's already running (the
   * single-instance contract under `Gio.ApplicationFlags
   * .HANDLES_COMMAND_LINE`).
   *
   * Scans argv for a `pixelrpg://join/<roomid>` URL via
   * {@link pickPixelrpgIntent}; if found, stashes it on the
   * Application + emits the `pixelrpg-intent` signal so any wired
   * UI surface (Welcome view's "Join session" entry, future
   * SessionService integration) can react. Always activates the
   * window afterwards so the user sees a focused maker either way.
   */
  vfunc_command_line(cmdline: Gio.ApplicationCommandLine): number {
    const argv = cmdline.get_arguments() ?? []
    const intent = pickPixelrpgIntent(argv)
    if (intent) {
      this.pendingIntent = intent
      this.emit('pixelrpg-intent', intent.kind, intent.roomId)
    }
    this.activate()
    return 0
  }

  /**
   * Atomically read + clear the pending intent. Call this from the
   * consumer (UI / SessionService) once you're ready to act on the
   * join; the intent is one-shot.
   */
  consumePendingIntent(): PixelrpgIntent | null {
    const intent = this.pendingIntent
    this.pendingIntent = null
    return intent
  }
}
