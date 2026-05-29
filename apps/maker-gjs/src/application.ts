import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import applicationStyle from './application.css'
import { APPLICATION_ID, PACKAGE_VERSION, PKGDATADIR, RESOURCES_PATH } from './constants.ts'
import { type PixelrpgIntent, pickPixelrpgIntent } from './services/pixelrpg-url.ts'
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
    super({
      applicationId: APPLICATION_ID,
      // HANDLES_COMMAND_LINE so the `x-scheme-handler/pixelrpg`
      // .desktop entry can re-dispatch to the running instance
      // when the user clicks `pixelrpg://join/<roomid>` in a
      // browser / chat. `vfunc_command_line` below parses argv
      // for the URL and emits `pixelrpg-intent`.
      flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
    })
    this.onStartup = this.onStartup.bind(this)
    this.connect('startup', this.onStartup)
    this.initActions()
  }

  protected onStartup(): void {
    this.initResources()
    this.initStyles()
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
      // const aboutParams: Partial<Adw.AboutWindow.ConstructorProps> = {
      //   transient_for: this.active_window,
      //   application_name: 'PixelRPG Map Editor',
      //   application_icon: APPLICATION_ID,
      //   developer_name: 'Pascal Garber',
      //   version: '0.1.0',
      //   developers: ['Pascal Garber'],
      //   copyright: '© 2024 Pascal Garber',
      // }
      // const aboutWindow = new Adw.AboutWindow(aboutParams)
      // Pass `null` as the release version until the metainfo has
      // proper <release> entries; libadwaita falls back to the latest
      // release block (or just the app metadata if there are none).
      const aboutDialog = Adw.AboutDialog.new_from_appdata(
        `${RESOURCES_PATH}/metainfo/${APPLICATION_ID}.metainfo.xml`,
        null,
      )
      aboutDialog.set_version(PACKAGE_VERSION)
      aboutDialog.present(this.get_active_window())
      // aboutWindow.present()
    })
    this.add_action(showAboutAction)

    const showPreferencesAction = new Gio.SimpleAction({ name: 'preferences' })
    showPreferencesAction.connect('activate', (_action) => {
      const preferencesDialog = new PreferencesDialog()
      preferencesDialog.present(this.active_window)
    })
    this.add_action(showPreferencesAction)
  }

  vfunc_activate() {
    let { active_window } = this

    if (!active_window) active_window = new ApplicationWindow(this)

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
