// MCP ↔ D-Bus orchestrator for the PixelRPG Maker.
//
// Runs as a GJS bundle (`gjsify build --app gjs`). An MCP client (e.g.
// Claude Code) launches it over stdio. Beyond translating tool calls to
// the running editor's `org.pixelrpg.maker.Control` D-Bus interface, it
// can LAUNCH AND MANAGE several editor instances side by side — so an
// agent can drive a host + a joiner and test collaborative editing.
//
// Instance addressing: every tool takes an optional `instance` label.
// "default" (the omitted value) targets the normal app on
// `org.pixelrpg.maker`; any other label targets `org.pixelrpg.maker.<label>`
// (a process launched with PIXELRPG_INSTANCE=<label>, via launch_instance).
//
// The editor must be running for instance tools to work; otherwise they
// return a clear "app not running" message.
//
// Usage (MCP client config):
//   claude mcp add maker -- <abs>/apps/mcp-bridge/dist/mcp-bridge.gjs.mjs

import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { GjsStdioTransport } from './stdio-transport.ts'

const BASE_NAME = 'org.pixelrpg.maker'
const BASE_PATH = '/org/pixelrpg/maker'
const CONTROL_IFACE = 'org.pixelrpg.maker.Control'
const DBUS_IFACE = 'org.freedesktop.DBus'

const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null)

// --- instance addressing ---

/** Coerce a label into the same app-id segment the app derives from PIXELRPG_INSTANCE. */
function sanitizeLabel(label: string): string {
  const cleaned = label.toLowerCase().replace(/[^a-z0-9]/g, '')
  return /^[a-z]/.test(cleaned) ? cleaned : `i${cleaned || '0'}`
}

/** Resolve an instance label to its D-Bus name + Control object path. */
function resolve(label?: string): { busName: string; controlPath: string; label: string } {
  const l = label && label !== 'default' ? sanitizeLabel(label) : 'default'
  if (l === 'default') return { busName: BASE_NAME, controlPath: `${BASE_PATH}/control`, label: 'default' }
  return { busName: `${BASE_NAME}.${l}`, controlPath: `${BASE_PATH}/${l}/control`, label: l }
}

// --- process management ---

/** Editor processes this orchestrator launched, keyed by sanitized label. */
const launched = new Map<string, Gio.Subprocess>()

/** Absolute path to the maker bundle (via CLAUDE_PROJECT_DIR, else relative to this bundle). */
function makerBinary(): string {
  const projectDir = GLib.getenv('CLAUDE_PROJECT_DIR')
  if (projectDir) return GLib.build_filenamev([projectDir, 'apps', 'maker-gjs', 'org.pixelrpg.maker'])
  const [self] = GLib.filename_from_uri(import.meta.url)
  const dist = GLib.path_get_dirname(self) // …/apps/mcp-bridge/dist
  const repo = GLib.path_get_dirname(GLib.path_get_dirname(GLib.path_get_dirname(dist)))
  return GLib.build_filenamev([repo, 'apps', 'maker-gjs', 'org.pixelrpg.maker'])
}

function nameHasOwner(busName: string): Promise<boolean> {
  return new Promise((res) => {
    bus.call(
      DBUS_IFACE,
      '/org/freedesktop/DBus',
      DBUS_IFACE,
      'NameHasOwner',
      GLib.Variant.new_tuple([GLib.Variant.new_string(busName)]),
      GLib.VariantType.new('(b)'),
      Gio.DBusCallFlags.NONE,
      -1,
      null,
      (conn, r) => {
        try {
          res(((conn as Gio.DBusConnection).call_finish(r).recursiveUnpack() as unknown[])[0] as boolean)
        } catch {
          res(false)
        }
      },
    )
  })
}

/** Poll until `busName` is owned (instance ready) or `timeoutMs` elapses. */
function waitForName(busName: string, timeoutMs = 30000): Promise<boolean> {
  const deadline = GLib.get_monotonic_time() + timeoutMs * 1000
  return new Promise((resolveWait) => {
    const tick = () => {
      void nameHasOwner(busName).then((owned) => {
        if (owned) return resolveWait(true)
        if (GLib.get_monotonic_time() >= deadline) return resolveWait(false)
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
          tick()
          return GLib.SOURCE_REMOVE
        })
      })
    }
    tick()
  })
}

function killAllLaunched(): void {
  for (const proc of launched.values()) {
    try {
      proc.force_exit()
    } catch {
      /* best-effort */
    }
  }
  launched.clear()
}

// --- D-Bus plumbing ---

/** Async call to an instance's Control interface; resolves with the reply variant. */
function control(
  label: string | undefined,
  method: string,
  params: GLib.Variant | null,
  replyType: string | null,
): Promise<GLib.Variant> {
  const { busName, controlPath } = resolve(label)
  return new Promise((res, rej) => {
    bus.call(
      busName,
      controlPath,
      CONTROL_IFACE,
      method,
      params,
      replyType ? GLib.VariantType.new(replyType) : null,
      Gio.DBusCallFlags.NONE,
      -1,
      null,
      (conn, r) => {
        try {
          res((conn as Gio.DBusConnection).call_finish(r))
        } catch (error) {
          rej(error)
        }
      },
    )
  })
}

const strv = (value: string) => GLib.Variant.new_string(value)

function activate(label: string | undefined, scope: string, name: string, value?: string | number | boolean) {
  const json = value === undefined ? '' : JSON.stringify(value)
  return control(label, 'ActivateAction', GLib.Variant.new_tuple([strv(scope), strv(name), strv(json)]), null)
}

function changeState(label: string | undefined, scope: string, name: string, value: string | number | boolean) {
  return control(
    label,
    'ChangeActionState',
    GLib.Variant.new_tuple([strv(scope), strv(name), strv(JSON.stringify(value))]),
    null,
  )
}

/** Call a `() -> (s)` Control method and return its JSON string (pretty-printed). */
async function jsonCall(label: string | undefined, method: string): Promise<string> {
  const reply = await control(label, method, null, '(s)')
  const [json] = reply.recursiveUnpack() as [string]
  return JSON.stringify(JSON.parse(json), null, 2)
}

// --- MCP server ---

const server = new McpServer({ name: 'pixelrpg-maker-orchestrator', version: '1.0.0' })

type ToolResult = {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>
  isError?: boolean
}
const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] })
const fail = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true })

function dbusError(error: unknown, label?: string): ToolResult {
  const message = error instanceof Error ? error.message : String(error)
  if (/ServiceUnknown|NameHasNoOwner|was not provided by any|StartServiceByName/.test(message)) {
    const which = resolve(label).label
    return fail(
      `The PixelRPG Maker instance "${which}" is not running on the session bus (${resolve(label).busName}). ` +
        (which === 'default'
          ? 'Start it with `gjsify workspace @pixelrpg/maker-gjs start`.'
          : 'Launch it with the launch_instance tool first.') +
        ` (D-Bus error: ${message})`,
    )
  }
  return fail(`D-Bus call failed: ${message}`)
}

const instanceArg = { instance: z.string().optional().describe('Editor instance label; omit for the default app') }

// instance fleet ------------------------------------------------------------

server.registerTool(
  'launch_instance',
  {
    description:
      'Launch a new editor instance with a distinct label so several makers run side by side (for ' +
      'collaboration testing). Optionally open a project once it is up. Address it later via the ' +
      '`instance` arg on other tools.',
    inputSchema: z.object({ label: z.string(), project: z.string().optional() }),
  },
  async ({ label, project }) => {
    const seg = sanitizeLabel(label)
    if (seg === 'default') return fail('Use a non-"default" label for a launched instance.')
    try {
      if (await nameHasOwner(`${BASE_NAME}.${seg}`)) return ok(`Instance "${seg}" is already running.`)
      const launcher = Gio.SubprocessLauncher.new(
        Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
      )
      launcher.setenv('PIXELRPG_INSTANCE', seg, true)
      // Spawn through a login shell so the user's full PATH (node,
      // gjsify, ~/.local/bin) is loaded — the MCP server's own env
      // (inherited from the host app) is typically too minimal for
      // `gjsify run` to resolve node.
      const shell = GLib.getenv('SHELL') || '/bin/bash'
      const proc = launcher.spawnv([shell, '-lc', `exec gjsify run ${GLib.shell_quote(makerBinary())}`])
      launched.set(seg, proc)
      const up = await waitForName(`${BASE_NAME}.${seg}`)
      if (!up) {
        try {
          proc.force_exit()
        } catch {
          /* best-effort */
        }
        launched.delete(seg)
        return fail(`Launched "${seg}" but it did not appear on the bus within 30s.`)
      }
      if (project) await control(seg, 'OpenProject', GLib.Variant.new_tuple([strv(project)]), null)
      return ok(`Launched instance "${seg}"${project ? ` and opened ${project}` : ''}.`)
    } catch (error) {
      return fail(`launch_instance failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
)

server.registerTool(
  'list_instances',
  {
    description: 'List editor instances on the session bus (default + labelled), with running + managed status.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const allNames = await new Promise<string[]>((res) => {
        bus.call(
          DBUS_IFACE,
          '/org/freedesktop/DBus',
          DBUS_IFACE,
          'ListNames',
          null,
          GLib.VariantType.new('(as)'),
          Gio.DBusCallFlags.NONE,
          -1,
          null,
          (conn, r) => {
            try {
              res(((conn as Gio.DBusConnection).call_finish(r).recursiveUnpack() as unknown[])[0] as string[])
            } catch {
              res([])
            }
          },
        )
      })
      const out = allNames
        .filter((n) => n === BASE_NAME || n.startsWith(`${BASE_NAME}.`))
        .map((busName) => {
          const label = busName === BASE_NAME ? 'default' : busName.slice(BASE_NAME.length + 1)
          return { label, busName, running: true, managed: launched.has(label) }
        })
      return ok(JSON.stringify(out, null, 2))
    } catch (error) {
      return fail(`list_instances failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
)

server.registerTool(
  'stop_instance',
  {
    description: 'Stop a launched editor instance (force-exit if this orchestrator started it, else ask it to quit).',
    inputSchema: z.object({ label: z.string() }),
  },
  async ({ label }) => {
    const seg = sanitizeLabel(label)
    if (seg === 'default') return fail('Refusing to stop the "default" instance.')
    const proc = launched.get(seg)
    if (proc) {
      try {
        proc.force_exit()
      } catch {
        /* best-effort */
      }
      launched.delete(seg)
      return ok(`Stopped instance "${seg}".`)
    }
    try {
      await activate(seg, 'app', 'quit')
      return ok(`Asked instance "${seg}" to quit.`)
    } catch (error) {
      return dbusError(error, seg)
    }
  },
)

// collaboration -------------------------------------------------------------

server.registerTool(
  'start_session',
  {
    description:
      'Host a collaboration session on the given instance (needs a loaded project; open a scene so the ' +
      "engine is live before a joiner connects). Returns the room id for join_session.",
    inputSchema: z.object({ ...instanceArg }),
  },
  async ({ instance }) => {
    try {
      const reply = await control(instance, 'StartSession', null, '(s)')
      const [roomId] = reply.recursiveUnpack() as [string]
      return ok(`Hosting session — room id: ${roomId}`)
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'join_session',
  {
    description:
      'Join a collaboration session by room id on the given instance (must be on the welcome view so LAN ' +
      'discovery is active). The pulled project loads automatically; then open a scene to attach the engine.',
    inputSchema: z.object({ roomId: z.string(), ...instanceArg }),
  },
  async ({ roomId, instance }) => {
    try {
      await control(instance, 'JoinSession', GLib.Variant.new_tuple([strv(roomId)]), null)
      return ok(`Joining room ${roomId} — poll get_session_state, then open the synced scene.`)
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'get_session_state',
  {
    description: 'Get the collaboration session state (kind: idle/browsing/hosting/connecting/awaiting-engine/connected).',
    inputSchema: z.object({ ...instanceArg }),
  },
  async ({ instance }) => {
    try {
      return ok(await jsonCall(instance, 'GetSessionState'))
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

// status + projects ---------------------------------------------------------

server.registerTool(
  'get_status',
  {
    description:
      'Snapshot the editor as JSON: current view, project, scene + scene list, active tool/tile/layer, ' +
      'zoom, undo/redo, play state, selection.',
    inputSchema: z.object({ ...instanceArg }),
  },
  async ({ instance }) => {
    try {
      return ok(await jsonCall(instance, 'GetStatus'))
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'screenshot',
  {
    description:
      'Capture a PNG screenshot. scope "window" (default) = whole app window (chrome + canvas); ' +
      '"canvas" = just the map/engine canvas.',
    inputSchema: z.object({ scope: z.enum(['window', 'canvas']).optional(), ...instanceArg }),
  },
  async ({ scope, instance }) => {
    try {
      const params = GLib.Variant.new_tuple([strv(scope ?? 'window')])
      const reply = await control(instance, 'Screenshot', params, '(ay)')
      const data = reply.get_child_value(0).deepUnpack() as Uint8Array | null
      if (!data || data.length === 0) return fail('Screenshot returned no data (is a window open and realised?).')
      return { content: [{ type: 'image', data: GLib.base64_encode(data), mimeType: 'image/png' }] }
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'open_project',
  {
    description: 'Open a project by its game-project.json absolute path. Poll get_status to confirm it loaded.',
    inputSchema: z.object({ path: z.string(), ...instanceArg }),
  },
  async ({ path, instance }) => {
    try {
      await control(instance, 'OpenProject', GLib.Variant.new_tuple([strv(path)]), null)
      return ok(`Opening project ${path}`)
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'list_recent_projects',
  {
    description: 'List recently opened projects (path, name, caption, openedAt).',
    inputSchema: z.object({ ...instanceArg }),
  },
  async ({ instance }) => {
    try {
      return ok(await jsonCall(instance, 'ListRecentProjects'))
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'list_templates',
  {
    description: 'List the built-in starter templates (id, name, caption, projectPath) that open_project can load.',
    inputSchema: z.object({ ...instanceArg }),
  },
  async ({ instance }) => {
    try {
      return ok(await jsonCall(instance, 'ListTemplates'))
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

// actions -------------------------------------------------------------------

server.registerTool(
  'list_actions',
  {
    description:
      'List the editor\'s GTK actions. scope "app"/"win"/"all" (default). Each has name, enabled, ' +
      'parameterType, stateType — what activate_action / change_action_state can drive.',
    inputSchema: z.object({ scope: z.enum(['app', 'win', 'all']).optional(), ...instanceArg }),
  },
  async ({ scope, instance }) => {
    try {
      const all = JSON.parse(await rawJson(instance, 'ListActions')) as Record<string, unknown>
      if (scope === 'app') return ok(JSON.stringify({ app: all.app }, null, 2))
      if (scope === 'win') return ok(JSON.stringify({ win: all.win }, null, 2))
      return ok(JSON.stringify(all, null, 2))
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

/** Raw (non-pretty) JSON string from a `() -> (s)` Control method. */
async function rawJson(label: string | undefined, method: string): Promise<string> {
  const reply = await control(label, method, null, '(s)')
  const [json] = reply.recursiveUnpack() as [string]
  return json
}

server.registerTool(
  'activate_action',
  {
    description:
      'Activate a GTK action. scope "app" or "win" (default). Optional value (string/number/boolean) is ' +
      'passed as the parameter. Discover names with list_actions.',
    inputSchema: z.object({
      scope: z.enum(['app', 'win']).optional(),
      name: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]).optional(),
      ...instanceArg,
    }),
  },
  async ({ scope, name, value, instance }) => {
    const which = scope ?? 'win'
    try {
      await activate(instance, which, name, value)
      return ok(`Activated ${which}.${name}${value === undefined ? '' : ` (${JSON.stringify(value)})`}`)
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'change_action_state',
  {
    description: 'Set a stateful GTK action\'s state (e.g. win.set-tool, win.toggle-grid, win.play). scope "app"/"win" (default).',
    inputSchema: z.object({
      scope: z.enum(['app', 'win']).optional(),
      name: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
      ...instanceArg,
    }),
  },
  async ({ scope, name, value, instance }) => {
    const which = scope ?? 'win'
    try {
      await changeState(instance, which, name, value)
      return ok(`Set ${which}.${name} state to ${JSON.stringify(value)}`)
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

// navigation / editing sugar ------------------------------------------------

function winActivateTool(tool: string, action: string, description: string): void {
  server.registerTool(tool, { description, inputSchema: z.object({ ...instanceArg }) }, async ({ instance }) => {
    try {
      await activate(instance, 'win', action)
      return ok(`Activated win.${action}`)
    } catch (error) {
      return dbusError(error, instance)
    }
  })
}

winActivateTool('undo', 'undo', 'Undo the last editor action.')
winActivateTool('redo', 'redo', 'Redo the next editor action.')
winActivateTool('zoom_in', 'zoom-in', 'Zoom the map camera in one step.')
winActivateTool('zoom_out', 'zoom-out', 'Zoom the map camera out one step.')
winActivateTool('zoom_reset', 'zoom-reset', 'Reset the map camera zoom to 100%.')
winActivateTool('back_to_atlas', 'back-to-atlas', 'Leave the scene editor and return to the atlas.')
winActivateTool('close_project', 'close-project', 'Close the project and return to the welcome view.')
winActivateTool('toggle_inspector', 'toggle-inspector', 'Toggle the right inspector sidebar.')

server.registerTool(
  'open_scene',
  {
    description: 'Open a scene in the editor by its id (see get_status → sceneIds / scenes).',
    inputSchema: z.object({ sceneId: z.string(), ...instanceArg }),
  },
  async ({ sceneId, instance }) => {
    try {
      await activate(instance, 'win', 'open-scene-by-id', sceneId)
      return ok(`Opened scene ${sceneId}`)
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'set_tool',
  {
    description: 'Select the active editor tool.',
    inputSchema: z.object({ tool: z.enum(['select', 'pencil', 'eraser', 'eyedropper']), ...instanceArg }),
  },
  async ({ tool, instance }) => {
    try {
      await changeState(instance, 'win', 'set-tool', tool)
      return ok(`Set tool to ${tool}`)
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'set_view',
  {
    description:
      'Switch the top-level view. "atlas"/"cast"/"tiles" need a loaded project; "welcome" closes it; ' +
      'for "scene-editor" use open_scene.',
    inputSchema: z.object({ view: z.enum(['welcome', 'atlas', 'cast', 'tiles', 'scene-editor']), ...instanceArg }),
  },
  async ({ view, instance }) => {
    try {
      switch (view) {
        case 'welcome':
          await activate(instance, 'win', 'close-project')
          break
        case 'atlas':
          await activate(instance, 'win', 'mode', 'world')
          break
        case 'cast':
          await activate(instance, 'win', 'mode', 'cast')
          break
        case 'tiles':
          await activate(instance, 'win', 'mode', 'tiles')
          break
        case 'scene-editor':
          return fail('Use open_scene { sceneId } to enter the scene editor.')
      }
      return ok(`Switched to ${view}`)
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'paint_tile',
  {
    description:
      'Paint or erase a tile at tile-coordinate (x, y). Omit tileId to use the active tile, tileId 0 to ' +
      'erase, or a global tile id to paint that tile. Omit layerId to use the active layer. Goes through ' +
      'the engine command path, so it undoes and (in a collab session) syncs to peers. Needs an open scene.',
    inputSchema: z.object({
      x: z.number().int(),
      y: z.number().int(),
      tileId: z.number().int().optional(),
      layerId: z.string().optional(),
      ...instanceArg,
    }),
  },
  async ({ x, y, tileId, layerId, instance }) => {
    try {
      const params = new GLib.Variant('(siii)', [layerId ?? '', x, y, tileId === undefined ? -1 : tileId])
      const reply = await control(instance, 'PaintTile', params, '(b)')
      const [applied] = reply.recursiveUnpack() as [boolean]
      return applied
        ? ok(`Painted tile (${x}, ${y})${tileId === undefined ? '' : ` with ${tileId}`}`)
        : fail('Paint not applied (no engine/scene, layer locked, or coords out of bounds).')
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'set_zoom',
  {
    description: 'Set the camera zoom to an absolute value (1 = 100%, e.g. 0.5, 2). Needs an open scene.',
    inputSchema: z.object({ zoom: z.number(), ...instanceArg }),
  },
  async ({ zoom, instance }) => {
    try {
      await control(instance, 'SetZoom', GLib.Variant.new_tuple([GLib.Variant.new_double(zoom)]), null)
      return ok(`Set zoom to ${zoom}`)
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'present_window',
  {
    description:
      "Bring the editor window to the foreground (map + focus). Needed before hosting/painting on a " +
      'background instance whose WebGL engine has not initialised yet (get_status.engineReady === false).',
    inputSchema: z.object({ ...instanceArg }),
  },
  async ({ instance }) => {
    try {
      await control(instance, 'PresentWindow', null, null)
      return ok('Presented window (foreground + focus).')
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

// AI collaborator presence (watch-the-assistant) -------------------------

server.registerTool(
  'assistant_cursor',
  {
    description:
      "Show or move the AI assistant's collaborator cursor at tile (x, y) on the active map — the user " +
      'watches it like a remote peer. Pair it with paint_tile to "point then paint". Needs an open scene.',
    inputSchema: z.object({ x: z.number().int(), y: z.number().int(), ...instanceArg }),
  },
  async ({ x, y, instance }) => {
    try {
      const reply = await control(
        instance,
        'SetAssistantCursor',
        GLib.Variant.new_tuple([GLib.Variant.new_int32(x), GLib.Variant.new_int32(y)]),
        '(b)',
      )
      const [applied] = reply.recursiveUnpack() as [boolean]
      return applied
        ? ok(`Assistant cursor at (${x}, ${y})`)
        : fail('Assistant cursor not applied — no active scene, or the user paused the assistant (check get_status.assistantPaused).')
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'assistant_info',
  {
    description: "Set the AI assistant collaborator's display name + colour (CSS hex, e.g. #9141ac).",
    inputSchema: z.object({ name: z.string(), color: z.string(), ...instanceArg }),
  },
  async ({ name, color, instance }) => {
    try {
      await control(instance, 'SetAssistantInfo', GLib.Variant.new_tuple([strv(name), strv(color)]), null)
      return ok(`Assistant info set: ${name} (${color})`)
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'assistant_hide',
  {
    description: "Remove the AI assistant collaborator cursor/presence from the editor.",
    inputSchema: z.object({ ...instanceArg }),
  },
  async ({ instance }) => {
    try {
      await control(instance, 'HideAssistant', null, null)
      return ok('Assistant hidden.')
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'set_playing',
  {
    description: 'Enter (true) or leave (false) playtest/runtime mode in the scene editor.',
    inputSchema: z.object({ playing: z.boolean(), ...instanceArg }),
  },
  async ({ playing, instance }) => {
    try {
      await changeState(instance, 'win', 'play', playing)
      return ok(`Set play state to ${playing}`)
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

server.registerTool(
  'toggle_grid',
  {
    description: 'Show or hide the editor grid overlay.',
    inputSchema: z.object({ on: z.boolean(), ...instanceArg }),
  },
  async ({ on, instance }) => {
    try {
      await changeState(instance, 'win', 'toggle-grid', on)
      return ok(`Set grid to ${on}`)
    } catch (error) {
      return dbusError(error, instance)
    }
  },
)

// --- start ---

const loop = GLib.MainLoop.new(null, false)

async function main() {
  const transport = new GjsStdioTransport(() => {
    killAllLaunched()
    loop.quit()
  })
  await server.connect(transport)
  console.error(`PixelRPG Maker MCP orchestrator running on stdio (D-Bus base: ${BASE_NAME})`)
}

main().catch((error) => {
  console.error('Fatal:', error instanceof Error ? error.message : error)
  if (error instanceof Error && error.stack) console.error(error.stack)
  killAllLaunched()
  loop.quit()
  process.exit(1)
})

// Keep the process alive and pump the async stdin read loop until the
// client closes stdin (EOF → killAllLaunched + loop.quit()).
loop.run()
