// MCP ↔ D-Bus bridge for the PixelRPG Maker.
//
// Runs as a GJS bundle (`gjsify build --app gjs`). An MCP client (e.g.
// Claude Code) launches it over stdio; it relays each tool call to the
// running editor's `org.pixelrpg.maker.Control` D-Bus interface:
//
//   - GetStatus / Screenshot        → inspect the editor
//   - ListActions / ActivateAction  → discover + drive every app.*/win.* action
//     / ChangeActionState
//
// The editor must be running for tools to work; otherwise tools return a
// clear "app not running" message.
//
// The built bundle is executable (shebang `gjs -m`); launch it directly.
// Do NOT use `gjsify run` for an MCP server — it keeps a main loop and
// won't exit when the client closes stdin.
//
// Usage (MCP client config):
//   claude mcp add maker -- <abs>/apps/mcp-bridge/dist/mcp-bridge.gjs.mjs

import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { GjsStdioTransport } from './stdio-transport.ts'

const BUS_NAME = 'org.pixelrpg.maker'
const CONTROL_PATH = '/org/pixelrpg/maker/control'
const CONTROL_IFACE = 'org.pixelrpg.maker.Control'

const bus = Gio.bus_get_sync(Gio.BusType.SESSION, null)

// --- D-Bus plumbing ---

/** Async call to the editor's Control interface; resolves with the reply variant. */
function control(method: string, params: GLib.Variant | null, replyType: string | null): Promise<GLib.Variant> {
  return new Promise((resolve, reject) => {
    bus.call(
      BUS_NAME,
      CONTROL_PATH,
      CONTROL_IFACE,
      method,
      params,
      replyType ? GLib.VariantType.new(replyType) : null,
      Gio.DBusCallFlags.NONE,
      -1,
      null,
      (conn, res) => {
        try {
          resolve((conn as Gio.DBusConnection).call_finish(res))
        } catch (error) {
          reject(error)
        }
      },
    )
  })
}

const str = (value: string) => GLib.Variant.new_string(value)

/** Control.ActivateAction(scope, name, value_json). */
function activate(scope: string, name: string, value?: string | number | boolean): Promise<GLib.Variant> {
  const json = value === undefined ? '' : JSON.stringify(value)
  return control('ActivateAction', GLib.Variant.new_tuple([str(scope), str(name), str(json)]), null)
}

/** Control.ChangeActionState(scope, name, value_json). */
function changeState(scope: string, name: string, value: string | number | boolean): Promise<GLib.Variant> {
  return control('ChangeActionState', GLib.Variant.new_tuple([str(scope), str(name), str(JSON.stringify(value))]), null)
}

// --- MCP server ---

const server = new McpServer({ name: 'pixelrpg-maker-bridge', version: '0.0.1' })

type ToolResult = {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>
  isError?: boolean
}

const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] })
const fail = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true })

function dbusError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error)
  if (/ServiceUnknown|NameHasNoOwner|was not provided by any|StartServiceByName/.test(message)) {
    return fail(
      `The PixelRPG Maker app is not running on the session bus (${BUS_NAME}). ` +
        'Start it first, e.g. `gjsify workspace @pixelrpg/maker-gjs start`. ' +
        `(D-Bus error: ${message})`,
    )
  }
  return fail(`D-Bus call failed: ${message}`)
}

// status -------------------------------------------------------------------

server.registerTool(
  'get_status',
  {
    description:
      'Snapshot the running PixelRPG Maker as JSON: current view, loaded project, current scene, ' +
      'scene list, active tool/tile/layer, camera zoom, undo/redo availability, play state, and ' +
      'selected placements.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const reply = await control('GetStatus', null, '(s)')
      const [json] = reply.recursiveUnpack() as [string]
      return ok(JSON.stringify(JSON.parse(json), null, 2))
    } catch (error) {
      return dbusError(error)
    }
  },
)

// screenshot ---------------------------------------------------------------

server.registerTool(
  'screenshot',
  {
    description:
      'Capture a PNG screenshot of the running PixelRPG Maker. scope "window" (default) captures the ' +
      'whole app window (chrome + sidebars + canvas); scope "canvas" captures just the map/engine canvas.',
    inputSchema: z.object({ scope: z.enum(['window', 'canvas']).optional() }),
  },
  async ({ scope }) => {
    try {
      const params = GLib.Variant.new_tuple([str(scope ?? 'window')])
      const reply = await control('Screenshot', params, '(ay)')
      const data = reply.get_child_value(0).deepUnpack() as Uint8Array | null
      if (!data || data.length === 0) {
        return fail('Screenshot returned no data (is a window open and realised?).')
      }
      return { content: [{ type: 'image', data: GLib.base64_encode(data), mimeType: 'image/png' }] }
    } catch (error) {
      return dbusError(error)
    }
  },
)

// generic action access ----------------------------------------------------

server.registerTool(
  'list_actions',
  {
    description:
      'List the GTK actions the editor exposes. scope "app" = app.* actions, "win" = the window\'s ' +
      'win.* actions, "all" (default) = both. Each entry has name, enabled, parameterType and ' +
      'stateType — use this to discover what activate_action / change_action_state can drive.',
    inputSchema: z.object({ scope: z.enum(['app', 'win', 'all']).optional() }),
  },
  async ({ scope }) => {
    try {
      const reply = await control('ListActions', null, '(s)')
      const [json] = reply.recursiveUnpack() as [string]
      const all = JSON.parse(json) as Record<string, unknown>
      if (scope === 'app') return ok(JSON.stringify({ app: all.app }, null, 2))
      if (scope === 'win') return ok(JSON.stringify({ win: all.win }, null, 2))
      return ok(JSON.stringify(all, null, 2))
    } catch (error) {
      return dbusError(error)
    }
  },
)

server.registerTool(
  'activate_action',
  {
    description:
      'Activate a GTK action. scope "app" or "win" (default). Optional value (string/number/boolean) ' +
      'is passed as the action parameter. Discover names + parameter types with list_actions.',
    inputSchema: z.object({
      scope: z.enum(['app', 'win']).optional(),
      name: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    }),
  },
  async ({ scope, name, value }) => {
    const which = scope ?? 'win'
    try {
      await activate(which, name, value)
      return ok(`Activated ${which}.${name}${value === undefined ? '' : ` (${JSON.stringify(value)})`}`)
    } catch (error) {
      return dbusError(error)
    }
  },
)

server.registerTool(
  'change_action_state',
  {
    description:
      'Set the state of a stateful GTK action (e.g. win.set-tool, win.toggle-grid, win.play). ' +
      'scope "app" or "win" (default). Idempotent, unlike activating a toggle.',
    inputSchema: z.object({
      scope: z.enum(['app', 'win']).optional(),
      name: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
    }),
  },
  async ({ scope, name, value }) => {
    const which = scope ?? 'win'
    try {
      await changeState(which, name, value)
      return ok(`Set ${which}.${name} state to ${JSON.stringify(value)}`)
    } catch (error) {
      return dbusError(error)
    }
  },
)

// convenience wrappers (ergonomic sugar over the generic action tools) ------

/** Register a no-argument tool that activates a single `win.*` action. */
function winActivateTool(tool: string, action: string, description: string): void {
  server.registerTool(tool, { description, inputSchema: z.object({}) }, async () => {
    try {
      await activate('win', action)
      return ok(`Activated win.${action}`)
    } catch (error) {
      return dbusError(error)
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
    inputSchema: z.object({ sceneId: z.string() }),
  },
  async ({ sceneId }) => {
    try {
      await activate('win', 'open-scene-by-id', sceneId)
      return ok(`Opened scene ${sceneId}`)
    } catch (error) {
      return dbusError(error)
    }
  },
)

server.registerTool(
  'set_tool',
  {
    description: 'Select the active editor tool.',
    inputSchema: z.object({ tool: z.enum(['select', 'pencil', 'eraser', 'eyedropper']) }),
  },
  async ({ tool }) => {
    try {
      await changeState('win', 'set-tool', tool)
      return ok(`Set tool to ${tool}`)
    } catch (error) {
      return dbusError(error)
    }
  },
)

server.registerTool(
  'set_view',
  {
    description:
      'Switch the top-level view. "atlas"/"cast"/"tiles" require a loaded project; "welcome" closes ' +
      'the project; for "scene-editor" use open_scene instead.',
    inputSchema: z.object({ view: z.enum(['welcome', 'atlas', 'cast', 'tiles', 'scene-editor']) }),
  },
  async ({ view }) => {
    try {
      switch (view) {
        case 'welcome':
          await activate('win', 'close-project')
          break
        case 'atlas':
          await activate('win', 'mode', 'world')
          break
        case 'cast':
          await activate('win', 'mode', 'cast')
          break
        case 'tiles':
          await activate('win', 'mode', 'tiles')
          break
        case 'scene-editor':
          return fail('Use open_scene { sceneId } to enter the scene editor.')
      }
      return ok(`Switched to ${view}`)
    } catch (error) {
      return dbusError(error)
    }
  },
)

server.registerTool(
  'set_playing',
  {
    description: 'Enter (true) or leave (false) playtest/runtime mode in the scene editor.',
    inputSchema: z.object({ playing: z.boolean() }),
  },
  async ({ playing }) => {
    try {
      await changeState('win', 'play', playing)
      return ok(`Set play state to ${playing}`)
    } catch (error) {
      return dbusError(error)
    }
  },
)

server.registerTool(
  'toggle_grid',
  {
    description: 'Show or hide the editor grid overlay.',
    inputSchema: z.object({ on: z.boolean() }),
  },
  async ({ on }) => {
    try {
      await changeState('win', 'toggle-grid', on)
      return ok(`Set grid to ${on}`)
    } catch (error) {
      return dbusError(error)
    }
  },
)

// --- start ---

const loop = GLib.MainLoop.new(null, false)

async function main() {
  const transport = new GjsStdioTransport(() => loop.quit())
  await server.connect(transport)
  console.error(`PixelRPG Maker MCP bridge running on stdio (D-Bus target: ${BUS_NAME})`)
}

main().catch((error) => {
  console.error('Fatal:', error instanceof Error ? error.message : error)
  if (error instanceof Error && error.stack) console.error(error.stack)
  loop.quit()
  process.exit(1)
})

// Keep the process alive and pump the async stdin read loop until the
// client closes stdin (EOF → transport.onclose → loop.quit()).
loop.run()
