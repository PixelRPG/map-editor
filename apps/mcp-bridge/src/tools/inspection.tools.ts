import GLib from '@girs/glib-2.0'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { presentWindow, readJsonPretty, resizeWindow, screenshot } from '../dbus/control-client.ts'
import { dbusError } from '../dbus/dbus-error.ts'
import { delay } from '../main-loop.ts'
import { fail, ok } from '../tool-result.ts'
import { instanceArg } from './instance-arg.ts'
import { resolveWindowSize, SIZE_PRESETS } from './window-size.ts'

/** Reading the editor's state and looking at it — status, pixels, window geometry. */
export function registerInspectionTools(server: McpServer): void {
  server.registerTool(
    'get_status',
    {
      description:
        'Snapshot the editor as JSON: view, project, scene + scene list, engine presence/readiness, mapped, ' +
        'active tool/tile/layer, zoom, canUndo/canRedo, play state, selected placements, assistant ' +
        'presence/pause (while assistantPaused is true every mutating tool is rejected with an ' +
        'assistant-paused error until the USER resumes — you cannot un-pause yourself), participants and ' +
        'the followed peer.',
      inputSchema: z.object({ ...instanceArg }),
    },
    async ({ instance }) => {
      try {
        return ok(await readJsonPretty(instance, 'GetStatus'))
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

  server.registerTool(
    'screenshot',
    {
      description:
        'Capture a PNG screenshot. scope "window" (default) = whole app window (chrome + canvas) via the GTK ' +
        'snapshot pipeline — needs a visible window (auto-raises + retries once when the capture comes back ' +
        'empty). scope "canvas" = just the rendered engine content, read DIRECTLY from the WebGL framebuffer: ' +
        'no UI chrome, and it returns the last rendered frame even when the window is occluded or minimised — ' +
        'prefer it for verifying map/game content. For reasoning about a map (walkability, placements, ' +
        'teleports) prefer get_map_data over any screenshot.',
      inputSchema: z.object({ scope: z.enum(['window', 'canvas']).optional(), ...instanceArg }),
    },
    async ({ scope, instance }) => {
      const wanted = scope ?? 'window'
      try {
        let data = await screenshot(instance, wanted)
        if (!data || data.length === 0) {
          // The capture re-renders the window's GSK node offscreen, which
          // needs a mapped window with a settled allocation. If it's
          // occluded/minimized or mid-resize, raise it, let a couple frames
          // land, and try once more.
          await presentWindow(instance)
          await delay(350)
          data = await screenshot(instance, wanted)
        }
        if (!data || data.length === 0) {
          return fail(
            'Screenshot returned no data — the window is likely occluded, minimized, or mid-resize. ' +
              'Bring it to the foreground (or call present_window) and retry.',
          )
        }
        return { content: [{ type: 'image', data: GLib.base64_encode(data), mimeType: 'image/png' }] }
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

  server.registerTool(
    'present_window',
    {
      description:
        'Bring the editor window to the foreground (map + focus). Needed before hosting/painting on a ' +
        'background instance whose WebGL engine has not initialised yet (get_status.engineReady === false).',
      inputSchema: z.object({ ...instanceArg }),
    },
    async ({ instance }) => {
      try {
        await presentWindow(instance)
        return ok('Presented window (foreground + focus).')
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )

  server.registerTool(
    'resize_window',
    {
      description:
        'Resize the editor window to test the responsive (phone / tablet / desktop) layout. Pass a `preset` ' +
        `(${Object.keys(SIZE_PRESETS).join(', ')}) or explicit width + height in pixels (these override the ` +
        'preset). Take a screenshot afterwards to inspect the layout at that size.',
      inputSchema: z.object({
        preset: z
          .enum(['phone', 'phone-landscape', 'tablet', 'tablet-landscape', 'desktop', 'desktop-large'])
          .optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        ...instanceArg,
      }),
    },
    async ({ preset, width, height, instance }) => {
      const size = resolveWindowSize(preset, width, height)
      if (!size) return fail('Provide a `preset` or both `width` and `height`.')
      try {
        const [rw, rh] = await resizeWindow(instance, size[0], size[1])
        return ok(`Resized window to ${rw}×${rh}px${preset ? ` (${preset})` : ''}. Screenshot to inspect the layout.`)
      } catch (error) {
        return dbusError(error, instance)
      }
    },
  )
}
