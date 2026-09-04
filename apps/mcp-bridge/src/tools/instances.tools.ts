import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { listNames, nameHasOwner, waitForName } from '../dbus/bus.ts'
import { activateAction, openProject } from '../dbus/control-client.ts'
import { dbusError } from '../dbus/dbus-error.ts'
import { BASE_NAME, sanitizeLabel } from '../instance-routing.ts'
import { isManagedInstance, spawnInstance, terminateInstance } from '../instances/launcher.ts'
import { fail, ok } from '../tool-result.ts'

/** Launching, listing and stopping the editor processes this orchestrator drives. */
export function registerInstanceTools(server: McpServer): void {
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
        spawnInstance(seg)
        if (!(await waitForName(`${BASE_NAME}.${seg}`))) {
          terminateInstance(seg)
          return fail(`Launched "${seg}" but it did not appear on the bus within 30s.`)
        }
        if (project) await openProject(seg, project)
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
      const instances = (await listNames())
        .filter((n) => n === BASE_NAME || n.startsWith(`${BASE_NAME}.`))
        .map((busName) => {
          const label = busName === BASE_NAME ? 'default' : busName.slice(BASE_NAME.length + 1)
          return { label, busName, running: true, managed: isManagedInstance(label) }
        })
      return ok(JSON.stringify(instances, null, 2))
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
      if (terminateInstance(seg)) return ok(`Stopped instance "${seg}".`)
      try {
        await activateAction(seg, 'app', 'quit')
        return ok(`Asked instance "${seg}" to quit.`)
      } catch (error) {
        return dbusError(error, seg)
      }
    },
  )
}
