# @pixelrpg/mcp-bridge

MCP↔D-Bus bridge: lets an AI agent inspect, drive and screenshot the
running PixelRPG Maker over its `org.pixelrpg.maker.Control` D-Bus
surface. **Dev-only tool** — it ships no end-user functionality.

Runs as a GJS bundle (no Node runtime): the MCP server speaks stdio to
the agent (via a Gio-based stdio transport) and forwards each tool call
to the maker's Control interface (status, screenshots, view/tool
switching, `paint_tile` / `place_object`, project open, collab-session
primitives, multi-instance via `PIXELRPG_INSTANCE`, assistant
presence/cursor).

External drivers automatically surface in the editor as the AI
participant — see `docs/concepts/ai-collaborator.md` § "Auto-presence".

## Build + run

```bash
gjsify workspace @pixelrpg/mcp-bridge build
gjsify workspace @pixelrpg/mcp-bridge start   # speaks MCP on stdio
```

Register it as a stdio MCP server in your agent tooling, then launch
the maker (`gjsify workspace @pixelrpg/maker-gjs start`) so the D-Bus
name is available.

## Related

- `apps/maker-gjs/src/services/control-dbus.service.ts` — the D-Bus
  interface the bridge drives
- [`docs/concepts/ai-collaborator.md`](../../docs/concepts/ai-collaborator.md)
  — the AI-as-collaborator concept this bridge powers
- `TODO.md` § "MCP orchestrator" — open follow-ups
