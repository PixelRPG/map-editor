import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import {
  followParticipant,
  hideAssistant,
  joinSession,
  readJsonPretty,
  setAssistantCursor,
  setAssistantInfo,
  startSession,
} from '../dbus/control-client.ts'
import { dbusError } from '../dbus/dbus-error.ts'
import { fail, ok } from '../tool-result.ts'
import { instanceArg } from './instance-arg.ts'

/**
 * The collaboration surface: hosting/joining a session, and the AI
 * collaborator's own presence in it (cursor, identity, followed peer) —
 * what the user watches like a remote peer.
 */
export function registerCollabTools(server: McpServer): void {
  server.registerTool(
    'start_session',
    {
      description:
        'Host a collaboration session on the given instance (needs a loaded project; open a scene so the ' +
        'engine is live before a joiner connects). Returns the room id for join_session.',
      inputSchema: z.object({ ...instanceArg }),
    },
    async ({ instance }) => {
      try {
        return ok(`Hosting session — room id: ${await startSession(instance)}`)
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
        await joinSession(instance, roomId)
        return ok(`Joining room ${roomId} — poll get_session_state, then open the synced scene.`)
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

  server.registerTool(
    'get_session_state',
    {
      description:
        'Get the collaboration session state (kind: idle/browsing/hosting/connecting/awaiting-engine/connected).',
      inputSchema: z.object({ ...instanceArg }),
    },
    async ({ instance }) => {
      try {
        return ok(await readJsonPretty(instance, 'GetSessionState'))
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

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
        const applied = await setAssistantCursor(instance, x, y)
        return applied
          ? ok(`Assistant cursor at (${x}, ${y})`)
          : fail(
              'Assistant cursor not applied — no active scene, or the user paused the assistant (check get_status.assistantPaused).',
            )
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
        await setAssistantInfo(instance, name, color)
        return ok(`Assistant info set: ${name} (${color})`)
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

  server.registerTool(
    'assistant_hide',
    {
      description: 'Remove the AI assistant collaborator cursor/presence from the editor.',
      inputSchema: z.object({ ...instanceArg }),
    },
    async ({ instance }) => {
      try {
        await hideAssistant(instance)
        return ok('Assistant hidden.')
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

  server.registerTool(
    'follow_participant',
    {
      description:
        'Follow a session participant with the camera so the user (or you) can watch their activity. Pass a ' +
        'peerId from get_status.participants[].peerId; an empty string stops following. Mirrors clicking a chip ' +
        "in the editor's collaborators bar.",
      inputSchema: z.object({ peerId: z.string(), ...instanceArg }),
    },
    async ({ peerId, instance }) => {
      try {
        await followParticipant(instance, peerId)
        return ok(peerId ? `Following participant ${peerId}` : 'Stopped following.')
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )
}
