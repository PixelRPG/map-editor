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
// Layout: `dbus/` speaks Control, `instances/` owns the launched
// processes, `tools/` holds one module per tool domain. This file only
// assembles them.
//
// Usage (MCP client config):
//   claude mcp add maker -- <abs>/apps/mcp-bridge/dist/mcp-bridge.gjs.mjs

import GLib from '@girs/glib-2.0'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { BASE_NAME } from './instance-routing.ts'
import { killAllLaunched } from './instances/launcher.ts'
import { GjsStdioTransport } from './stdio-transport.ts'
import { registerActionTools } from './tools/actions.tools.ts'
import { registerCollabTools } from './tools/collab.tools.ts'
import { registerEditingTools } from './tools/editing.tools.ts'
import { registerInspectionTools } from './tools/inspection.tools.ts'
import { registerInstanceTools } from './tools/instances.tools.ts'
import { registerProjectTools } from './tools/projects.tools.ts'

const server = new McpServer({ name: 'pixelrpg-maker-orchestrator', version: '1.0.0' })

registerInstanceTools(server)
registerProjectTools(server)
registerInspectionTools(server)
registerActionTools(server)
registerEditingTools(server)
registerCollabTools(server)

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
