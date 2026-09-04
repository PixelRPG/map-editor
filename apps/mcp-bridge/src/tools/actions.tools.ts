import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { activateAction, changeActionState, readJson } from '../dbus/control-client.ts'
import { dbusError } from '../dbus/dbus-error.ts'
import { ok } from '../tool-result.ts'
import { instanceArg } from './instance-arg.ts'

/**
 * The raw GTK-action surface — discovery, generic activation/state change,
 * and one named tool per parameterless `win.` action an agent reaches for
 * often enough to deserve its own name.
 */
export function registerActionTools(server: McpServer): void {
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
        const all = JSON.parse(await readJson(instance, 'ListActions')) as Record<string, unknown>
        if (scope === 'app') return ok(JSON.stringify({ app: all.app }, null, 2))
        if (scope === 'win') return ok(JSON.stringify({ win: all.win }, null, 2))
        return ok(JSON.stringify(all, null, 2))
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

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
        await activateAction(instance, which, name, value)
        return ok(`Activated ${which}.${name}${value === undefined ? '' : ` (${JSON.stringify(value)})`}`)
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

  server.registerTool(
    'change_action_state',
    {
      description:
        'Set a stateful GTK action\'s state (e.g. win.set-tool, win.toggle-grid, win.play). scope "app"/"win" (default).',
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
        await changeActionState(instance, which, name, value)
        return ok(`Set ${which}.${name} state to ${JSON.stringify(value)}`)
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

  registerWinAction(server, 'undo', 'undo', 'Undo the last editor action.')
  registerWinAction(server, 'redo', 'redo', 'Redo the next editor action.')
  registerWinAction(server, 'zoom_in', 'zoom-in', 'Zoom the map camera in one step.')
  registerWinAction(server, 'zoom_out', 'zoom-out', 'Zoom the map camera out one step.')
  registerWinAction(server, 'zoom_reset', 'zoom-reset', 'Reset the map camera zoom to 100%.')
  registerWinAction(server, 'back_to_atlas', 'back-to-atlas', 'Leave the scene editor and return to the atlas.')
  registerWinAction(server, 'close_project', 'close-project', 'Close the project and return to the welcome view.')
  registerWinAction(server, 'toggle_inspector', 'toggle-inspector', 'Toggle the right inspector sidebar.')
}

/** Register a tool that does nothing but activate one parameterless `win.` action. */
function registerWinAction(server: McpServer, tool: string, action: string, description: string): void {
  server.registerTool(tool, { description, inputSchema: z.object({ ...instanceArg }) }, async ({ instance }) => {
    try {
      await activateAction(instance, 'win', action)
      return ok(`Activated win.${action}`)
    } catch (error) {
      return dbusError(error, instance)
    }
  })
}
