import Gio from '@girs/gio-2.0'
import { ASSISTANT_PEER_ID } from '@pixelrpg/engine'
import type { Application } from '../application.ts'
import type { ApplicationWindow } from '../widgets/application-window.ts'
import {
  ControlUnavailableError,
  type EngineActionContext,
  guardControlAction,
  guardControlMethod,
  guardEngineAction,
} from './assistant-pause-policy.ts'
import { loadRecentProjects } from './recent-projects.ts'
import { STARTER_TEMPLATES } from './templates.ts'

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
    <method name="SetZoom">
      <arg type="d" direction="in" name="zoom"/>
    </method>
    <method name="PresentWindow"/>
    <method name="ResizeWindow">
      <arg type="i" direction="in" name="width"/>
      <arg type="i" direction="in" name="height"/>
      <arg type="i" direction="out" name="result_width"/>
      <arg type="i" direction="out" name="result_height"/>
    </method>
    <method name="PaintTile">
      <arg type="s" direction="in" name="layer_id"/>
      <arg type="i" direction="in" name="tile_x"/>
      <arg type="i" direction="in" name="tile_y"/>
      <arg type="i" direction="in" name="sprite_id"/>
      <arg type="b" direction="out" name="applied"/>
    </method>
    <method name="PlaceObject">
      <arg type="s" direction="in" name="def_id"/>
      <arg type="s" direction="in" name="layer_id"/>
      <arg type="i" direction="in" name="tile_x"/>
      <arg type="i" direction="in" name="tile_y"/>
      <arg type="b" direction="out" name="applied"/>
    </method>
    <method name="SetAssistantCursor">
      <arg type="i" direction="in" name="tile_x"/>
      <arg type="i" direction="in" name="tile_y"/>
      <arg type="b" direction="out" name="applied"/>
    </method>
    <method name="SetAssistantInfo">
      <arg type="s" direction="in" name="display_name"/>
      <arg type="s" direction="in" name="color"/>
    </method>
    <method name="HideAssistant"/>
    <method name="FollowParticipant">
      <arg type="s" direction="in" name="peer_id"/>
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
   * scalar. Throws (→ D-Bus error) on an unknown action, on a
   * human-only action (`win.toggle-assistant-paused`), while the user
   * has the assistant paused, and on engine-backed actions that would
   * silently no-op (no engine / empty undo stack).
   */
  ActivateAction(scope: string, name: string, valueJson: string): void {
    const win = this._guardMutation('ActivateAction')
    const actionScope = toScope(scope)
    guardControlAction(actionScope, name)
    guardEngineAction(actionScope, name, this._engineActionContext(win))
    this._surfaceAssistantActivity()
    // win.undo / win.redo: bypass the GAction (it has no parameter
    // channel for an initiator) and call the engine through the window
    // so the revert/apply op carries the assistant origin — remote
    // peers then attribute the undo to the AI, not the hosting user.
    // The guards above already rejected no-engine / nothing-to-undo.
    if (actionScope === 'win' && (name === 'undo' || name === 'redo')) {
      win.undoRedo(name, ASSISTANT_PEER_ID)
      return
    }
    win.activateAction(actionScope, name, valueJson ? JSON.parse(valueJson) : undefined)
  }

  /**
   * `ChangeActionState(scope, name, value_json)` — set a stateful
   * action's state from a JSON-encoded scalar. Same guards as
   * {@link ActivateAction}: unknown action, human-only action,
   * assistant paused, silent engine no-ops.
   */
  ChangeActionState(scope: string, name: string, valueJson: string): void {
    const win = this._guardMutation('ChangeActionState')
    const actionScope = toScope(scope)
    guardControlAction(actionScope, name)
    guardEngineAction(actionScope, name, this._engineActionContext(win))
    this._surfaceAssistantActivity()
    win.changeActionState(actionScope, name, JSON.parse(valueJson))
  }

  /** `OpenProject(path)` — load a project by its game-project.json path. */
  OpenProject(path: string): void {
    const win = this._guardMutation('OpenProject')
    this._surfaceAssistantActivity()
    win.openProject(path)
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
    const win = this._guardMutation('StartSession')
    this._surfaceAssistantActivity()
    return win.startSession()
  }

  /** `JoinSession(roomId)` — join a collaboration session by room id (LAN). */
  async JoinSession(roomId: string): Promise<void> {
    const win = this._guardMutation('JoinSession')
    this._surfaceAssistantActivity()
    await win.joinSession(roomId)
  }

  /** `GetSessionState() -> s` — JSON snapshot of the collaboration session state. */
  GetSessionState(): string {
    const win = this.window
    if (!win) return JSON.stringify({ kind: 'no-active-window' })
    return JSON.stringify(win.getSessionState())
  }

  /**
   * `SetZoom(zoom)` — set the camera zoom to an absolute value (1 = 100%).
   * Throws a typed `no-engine` error when there is no live scene engine
   * (instead of silently succeeding).
   */
  SetZoom(zoom: number): void {
    const win = this._guardMutation('SetZoom')
    this._surfaceAssistantActivity()
    if (!win.setZoom(zoom)) {
      throw new ControlUnavailableError(
        'no-engine',
        'SetZoom needs a live scene engine — open a scene first (open_scene / win.open-scene-by-id), then retry.',
      )
    }
  }

  /** `PresentWindow()` — bring the editor window to the foreground (map + focus). */
  PresentWindow(): void {
    this.requireWindow().present()
  }

  /**
   * `ResizeWindow(width, height) -> (result_width, result_height)` — resize
   * the top-level to an absolute pixel size to test the responsive
   * (phone / tablet / desktop) breakpoints. Returns the requested size.
   */
  ResizeWindow(width: number, height: number): [number, number] {
    const win = this._guardMutation('ResizeWindow')
    // Mutating (it resizes the USER's window) → surface the assistant in
    // the participants bar; no cursor — there's no spatial target.
    this._surfaceAssistantActivity()
    return win.resizeWindow(width, height)
  }

  /**
   * `PaintTile(layer_id, x, y, sprite_id) -> applied` — paint/erase a tile.
   * `layer_id` `''` = active layer; `sprite_id` `-1` = active tile, `0` = erase,
   * `>0` = paint that global tile id.
   */
  PaintTile(layerId: string, tileX: number, tileY: number, spriteId: number): boolean {
    const win = this._guardMutation('PaintTile')
    this._surfaceAssistantActivity({ x: tileX, y: tileY })
    // Control callers are the external (AI) driver — stamp the
    // assistant as the op's `origin` so remote peers attribute the
    // edit to the AI, not the hosting user. The op still rides the
    // host's peerId/seq (transport identity is unchanged).
    return win.paintTile(layerId || null, tileX, tileY, spriteId < 0 ? undefined : spriteId, ASSISTANT_PEER_ID)
  }

  /**
   * `PlaceObject(def_id, layer_id, x, y) -> applied` — stamp a library
   * object (entity definition) onto the active map. `layer_id` `''` =
   * active layer. Goes through the engine command path (undo + collab).
   */
  PlaceObject(defId: string, layerId: string, tileX: number, tileY: number): boolean {
    const win = this._guardMutation('PlaceObject')
    this._surfaceAssistantActivity({ x: tileX, y: tileY })
    // Assistant-attributed like PaintTile — see the comment there.
    return win.placeObject(defId, layerId || null, tileX, tileY, ASSISTANT_PEER_ID)
  }

  /** `SetAssistantCursor(x, y) -> applied` — show/move the AI collaborator cursor. */
  SetAssistantCursor(tileX: number, tileY: number): boolean {
    return this.requireWindow().setAssistantCursor(tileX, tileY)
  }

  /** `SetAssistantInfo(name, color)` — set the AI collaborator's label + colour. */
  SetAssistantInfo(displayName: string, color: string): void {
    this.requireWindow().setAssistantInfo(displayName, color)
  }

  /** `HideAssistant()` — remove the AI collaborator cursor/presence. */
  HideAssistant(): void {
    this.requireWindow().hideAssistant()
  }

  /** `FollowParticipant(peer_id)` — follow a participant with the camera; `''` stops following. */
  FollowParticipant(peerId: string): void {
    const win = this._guardMutation('FollowParticipant')
    // Mutating (it pans/locks the USER's camera) → surface the assistant.
    this._surfaceAssistantActivity()
    win.followParticipant(peerId || null)
  }

  private requireWindow(): ApplicationWindow {
    const win = this.window
    if (!win) throw new Error('No active window')
    return win
  }

  /**
   * Shared entry guard for every MUTATING Control method: resolves the
   * window and rejects the call with a typed `assistant-paused` D-Bus
   * error while the user has the assistant paused. The classification
   * (mutating vs read-only vs presence) lives in
   * `assistant-pause-policy.ts` — see ai-collaborator.md § Pause contract.
   */
  private _guardMutation(method: string): ApplicationWindow {
    const win = this.requireWindow()
    guardControlMethod(method, win.isAssistantPaused())
    return win
  }

  /** Snapshot the engine-availability slice `guardEngineAction` consults. */
  private _engineActionContext(win: ApplicationWindow): EngineActionContext {
    const status = win.getDebugStatus()
    return { engineReady: status.engineReady, canUndo: status.canUndo, canRedo: status.canRedo }
  }

  /**
   * Surface the external driver as the AI participant. Called by every
   * MUTATING control method (read-onlys like `GetStatus` / `Screenshot`
   * stay silent), so the user always sees in the participants bar that an
   * AI/automation is acting — and can follow it — even when the driver
   * never announces itself explicitly: `ActivateAction`,
   * `ChangeActionState`, `OpenProject`, `StartSession`, `JoinSession`,
   * `SetZoom`, `ResizeWindow`, `PaintTile`, `PlaceObject`,
   * `FollowParticipant`. Tile-targeted mutations also move the assistant
   * cursor onto the target tile, making the activity followable on the
   * map. `HideAssistant` remains the explicit opt-out when a driver
   * finishes.
   */
  private _surfaceAssistantActivity(tile?: { x: number; y: number }): void {
    const win = this.window
    if (!win) return
    // The cursor path only applies with a live engine (scene editor);
    // fall back to bare presence everywhere else.
    if (!(tile && win.setAssistantCursor(tile.x, tile.y))) win.ensureAssistantPresence()
  }
}

function toScope(scope: string): 'app' | 'win' {
  return scope === 'app' ? 'app' : 'win'
}
