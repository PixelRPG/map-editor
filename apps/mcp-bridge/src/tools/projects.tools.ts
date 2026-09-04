import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { getMapData, openProject, readJsonPretty } from '../dbus/control-client.ts'
import { dbusError } from '../dbus/dbus-error.ts'
import { ok } from '../tool-result.ts'
import { instanceArg } from './instance-arg.ts'

/** Opening a project and reading what it contains. */
export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    'open_project',
    {
      description: 'Open a project by its game-project.json absolute path. Poll get_status to confirm it loaded.',
      inputSchema: z.object({ path: z.string(), ...instanceArg }),
    },
    async ({ path, instance }) => {
      try {
        await openProject(instance, path)
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
        return ok(await readJsonPretty(instance, 'ListRecentProjects'))
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
        return ok(await readJsonPretty(instance, 'ListTemplates'))
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

  server.registerTool(
    'get_map_data',
    {
      description:
        'Agent-oriented JSON projection of a loaded map: a walkability grid (one string per row — "." walkable, ' +
        '"#" solid, " " void/no tile), placements with resolved names + component types, spawn points, and ' +
        'teleports with their target map/tile. Kilobytes instead of pixels — use this to plan where to walk or ' +
        'paint BEFORE reaching for screenshots. Needs an open project (see get_status sceneIds for valid map ids) ' +
        'but NO open scene, engine or visible window.',
      inputSchema: z.object({ map_id: z.string(), ...instanceArg }),
    },
    async ({ map_id, instance }) => {
      try {
        return ok(JSON.stringify(JSON.parse(await getMapData(instance, map_id)), null, 2))
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )
}
