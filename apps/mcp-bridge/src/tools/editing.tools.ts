import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { activateAction, changeActionState, fillTile, paintTile, placeObject, setZoom } from '../dbus/control-client.ts'
import { dbusError } from '../dbus/dbus-error.ts'
import { fail, ok } from '../tool-result.ts'
import { instanceArg } from './instance-arg.ts'

const VIEWS = ['welcome', 'atlas', 'cast', 'objects', 'tiles', 'game', 'scene-editor'] as const
type ViewName = (typeof VIEWS)[number]

/**
 * The `win.` action each top-level view is reached through, with its
 * parameter where one is needed. `scene-editor` is deliberately absent:
 * entering it needs a scene id, so open_scene owns that route.
 */
const VIEW_ACTIONS: Partial<Record<ViewName, readonly [string, string?]>> = {
  welcome: ['close-project'],
  atlas: ['mode', 'world'],
  cast: ['mode', 'cast'],
  objects: ['mode', 'objects'],
  tiles: ['mode', 'tiles'],
  game: ['mode', 'game'],
}

/** Named editing operations: what the agent changes about a scene, rather than which action drives it. */
export function registerEditingTools(server: McpServer): void {
  server.registerTool(
    'open_scene',
    {
      description: 'Open a scene in the editor by its id (see get_status → sceneIds / scenes).',
      inputSchema: z.object({ sceneId: z.string(), ...instanceArg }),
    },
    async ({ sceneId, instance }) => {
      try {
        await activateAction(instance, 'win', 'open-scene-by-id', sceneId)
        return ok(`Opened scene ${sceneId}`)
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

  server.registerTool(
    'set_tool',
    {
      description:
        'Select the active editor tool. `object` stamps the armed object brush on canvas clicks — arm a ' +
        'brush first via activate_action win.set-object-brush with an entityLibrary id (place_object places ' +
        'directly and does NOT arm the brush).',
      inputSchema: z.object({
        tool: z.enum(['select', 'pencil', 'fill', 'eraser', 'eyedropper', 'object']),
        ...instanceArg,
      }),
    },
    async ({ tool, instance }) => {
      try {
        await changeActionState(instance, 'win', 'set-tool', tool)
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
        'Switch the top-level view. "atlas"/"cast"/"objects"/"tiles"/"game" need a loaded project; "welcome" closes it; ' +
        'for "scene-editor" use open_scene. "game" is the project\'s own page: name, tile size and game rules.',
      inputSchema: z.object({ view: z.enum(VIEWS), ...instanceArg }),
    },
    async ({ view, instance }) => {
      const mapped = VIEW_ACTIONS[view]
      if (!mapped) return fail('Use open_scene { sceneId } to enter the scene editor.')
      try {
        await activateAction(instance, 'win', mapped[0], mapped[1])
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
        const applied = await paintTile(instance, { x, y, tileId, layerId })
        return applied
          ? ok(`Painted tile (${x}, ${y})${tileId === undefined ? '' : ` with ${tileId}`}`)
          : fail('Paint not applied (no engine/scene, layer locked, or coords out of bounds).')
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

  server.registerTool(
    'fill_tile',
    {
      description:
        'Bucket-fill from tile (x, y): flood-fills the contiguous region of tiles matching the origin tile ' +
        '(on the active or given layer) with a tile, as one undoable + collab-synced command. Omit tileId to ' +
        'use the active tile, or pass a global tile id. Fill is a paint tool — it does not erase. Needs an open scene.',
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
        const applied = await fillTile(instance, { x, y, tileId, layerId })
        return applied
          ? ok(`Filled from tile (${x}, ${y})${tileId === undefined ? '' : ` with ${tileId}`}`)
          : fail(
              'Fill not applied (no engine/scene, layer locked, no fill tile, coords out of bounds, or nothing to change).',
            )
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

  server.registerTool(
    'place_object',
    {
      description:
        'Place a library object (entity definition) on the active map at tile (x, y). `defId` is an ' +
        'entityLibrary id (create objects in the Objects view / win.new-object). Omit layerId for the active ' +
        'layer. Goes through the engine command path, so it undoes and (in a collab session) syncs to peers. ' +
        'Needs an open scene.',
      inputSchema: z.object({
        defId: z.string(),
        x: z.number().int(),
        y: z.number().int(),
        layerId: z.string().optional(),
        ...instanceArg,
      }),
    },
    async ({ defId, x, y, layerId, instance }) => {
      try {
        const applied = await placeObject(instance, { defId, x, y, layerId })
        return applied
          ? ok(`Placed object "${defId}" at (${x}, ${y})`)
          : fail('Not placed (no engine/scene, layer locked, coords out of bounds, or unknown defId).')
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
        await setZoom(instance, zoom)
        return ok(`Set zoom to ${zoom}`)
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
        await changeActionState(instance, 'win', 'play', playing)
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
        await changeActionState(instance, 'win', 'toggle-grid', on)
        return ok(`Set grid to ${on}`)
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )
}
