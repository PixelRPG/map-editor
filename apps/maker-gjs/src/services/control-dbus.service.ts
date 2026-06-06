import Gio from '@girs/gio-2.0'
import type { Application } from '../application.ts'
import { loadRecentProjects } from './recent-projects.ts'
import { STARTER_TEMPLATES } from './templates.ts'
import type { ApplicationWindow } from '../widgets/application-window.ts'

/**
 * D-Bus interface description for `org.pixelrpg.maker.Control`.
 *
 * Two methods that aren't expressible as `Gio.Action`s:
 * - `GetStatus`   → a JSON snapshot of the editor's live state.
 * - `Screenshot`  → PNG bytes of the window (or just the canvas).
 *
 * Navigation + commands are NOT here — `Gtk.Application` already exports
 * every `app.*` / `win.*` action over the standard `org.gtk.Actions`
 * interface, which external tooling drives directly.
 */
const CONTROL_IFACE_XML = `
<node>
  <interface name="org.pixelrpg.maker.Control">
    <method name="GetStatus">
      <arg type="s" direction="out" name="status_json"/>
    </method>
    <method name="Screenshot">
      <arg type="s" direction="in" name="scope"/>
      <arg type="ay" direction="out" name="png_bytes"/>
    </method>
    <method name="ListActions">
      <arg type="s" direction="out" name="actions_json"/>
    </method>
    <method name="ActivateAction">
      <arg type="s" direction="in" name="scope"/>
      <arg type="s" direction="in" name="name"/>
      <arg type="s" direction="in" name="value_json"/>
    </method>
    <method name="ChangeActionState">
      <arg type="s" direction="in" name="scope"/>
      <arg type="s" direction="in" name="name"/>
      <arg type="s" direction="in" name="value_json"/>
    </method>
    <method name="OpenProject">
      <arg type="s" direction="in" name="path"/>
    </method>
    <method name="ListRecentProjects">
      <arg type="s" direction="out" name="projects_json"/>
    </method>
    <method name="ListTemplates">
      <arg type="s" direction="out" name="templates_json"/>
    </method>
    <method name="StartSession">
      <arg type="s" direction="out" name="room_id"/>
    </method>
    <method name="JoinSession">
      <arg type="s" direction="in" name="room_id"/>
    </method>
    <method name="GetSessionState">
      <arg type="s" direction="out" name="state_json"/>
    </method>
  </interface>
</node>`

/**
 * Permanent `org.pixelrpg.maker.Control` D-Bus interface — lets external
 * tooling (the MCP bridge, `gdbus`, scripts) inspect and screenshot the
 * running editor. Constructed by {@link Application} and exported once the
 * session-bus connection is available; resolves the live window lazily
 * per call so it survives window recreation.
 */
export class ControlDbusService {
  private _exported: Gio.DBusExportedObject | null = null

  constructor(private readonly app: Application) {}

  /** Export the interface at `objectPath`. Idempotent. */
  export(connection: Gio.DBusConnection, objectPath: string): void {
    if (this._exported) return
    const exported = Gio.DBusExportedObject.wrapJSObject(CONTROL_IFACE_XML, this)
    exported.export(connection, objectPath)
    this._exported = exported
  }

  /** Tear the interface down. Idempotent. */
  unexport(): void {
    this._exported?.unexport()
    this._exported = null
  }

  private get window(): ApplicationWindow | null {
    return (this.app.active_window as ApplicationWindow | null) ?? null
  }

  // --- D-Bus methods (names + signatures match CONTROL_IFACE_XML) ---

  /** `GetStatus() -> s` — JSON snapshot of the editor's live state. */
  GetStatus(): string {
    const win = this.window
    if (!win) return JSON.stringify({ error: 'no-active-window' })
    return JSON.stringify(win.getDebugStatus())
  }

  /** `Screenshot(scope) -> ay` — PNG bytes. `scope`: `window` | `canvas`. */
  Screenshot(scope: string): Uint8Array {
    const win = this.window
    if (!win) return new Uint8Array(0)
    const mode = scope === 'canvas' ? 'canvas' : 'window'
    return win.captureScreenshot(mode) ?? new Uint8Array(0)
  }

  /** `ListActions() -> s` — JSON of the `app.*` + `win.*` actions. */
  ListActions(): string {
    const win = this.window
    if (!win) return JSON.stringify({ error: 'no-active-window' })
    return JSON.stringify(win.listActions())
  }

  /**
   * `ActivateAction(scope, name, value_json)` — activate an action.
   * `value_json` is `''` for no parameter, otherwise a JSON-encoded
   * scalar. Throws (→ D-Bus error) on an unknown action.
   */
  ActivateAction(scope: string, name: string, valueJson: string): void {
    const win = this.requireWindow()
    win.activateAction(toScope(scope), name, valueJson ? JSON.parse(valueJson) : undefined)
  }

  /**
   * `ChangeActionState(scope, name, value_json)` — set a stateful
   * action's state from a JSON-encoded scalar. Throws (→ D-Bus error)
   * on an unknown action.
   */
  ChangeActionState(scope: string, name: string, valueJson: string): void {
    const win = this.requireWindow()
    win.changeActionState(toScope(scope), name, JSON.parse(valueJson))
  }

  /** `OpenProject(path)` — load a project by its game-project.json path. */
  OpenProject(path: string): void {
    this.requireWindow().openProject(path)
  }

  /** `ListRecentProjects() -> s` — JSON list of recently opened projects. */
  ListRecentProjects(): string {
    return JSON.stringify(loadRecentProjects())
  }

  /** `ListTemplates() -> s` — JSON list of built-in starter templates. */
  ListTemplates(): string {
    return JSON.stringify(
      STARTER_TEMPLATES.map((t) => ({ id: t.id, name: t.name, caption: t.caption, projectPath: t.projectPath })),
    )
  }

  /** `StartSession() -> s` — host a collaboration session; returns the room id. */
  async StartSession(): Promise<string> {
    return this.requireWindow().startSession()
  }

  /** `JoinSession(roomId)` — join a collaboration session by room id (LAN). */
  async JoinSession(roomId: string): Promise<void> {
    await this.requireWindow().joinSession(roomId)
  }

  /** `GetSessionState() -> s` — JSON snapshot of the collaboration session state. */
  GetSessionState(): string {
    const win = this.window
    if (!win) return JSON.stringify({ kind: 'no-active-window' })
    return JSON.stringify(win.getSessionState())
  }

  private requireWindow(): ApplicationWindow {
    const win = this.window
    if (!win) throw new Error('No active window')
    return win
  }
}

function toScope(scope: string): 'app' | 'win' {
  return scope === 'app' ? 'app' : 'win'
}
