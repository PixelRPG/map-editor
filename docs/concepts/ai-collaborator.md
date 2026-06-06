# AI Collaborator — the MCP/D-Bus assistant as a live in-editor peer

> Status: **active** — Phases 1–4 landed (presence + cursor; edit
> attribution; presence pill + pause/stop; follow-cam + activation toast).
> Phase 5 (merge with networked collab) is gated on the WebRTC/GL work.
> Last meaningful change: 2026-06-06.

The `org.pixelrpg.maker.Control` D-Bus interface + the MCP bridge (see
[the orchestrator work in `TODO.md`]) started as a **developer** tool for
driving/inspecting the editor. This doc reframes it as an **end-user
feature**: an AI assistant that works *inside* the editor as a live
collaborator the user can watch in real time — its cursor moves, its
edits appear, it shows up in the presence roster — exactly like a remote
human peer.

## Core idea

The AI is a **virtual, in-process collaborator**, not a second app or a
network peer. It drives the user's single running editor through Control
(D-Bus/MCP) and is represented through the **same collaboration
machinery** a human peer uses:

- **Edits** → the engine's op-log. `paint_tile` already routes through
  `Engine.executeCommand` → `Command` → `COMMAND_EXECUTED`, the exact
  path a user edit takes. The edits apply + render immediately.
- **Presence + cursor** → the engine's awareness layer
  (`AwarenessManager`) + `RemoteCursorRenderer`. The AI publishes a
  `presence` + `cursor` frame; the existing renderer draws a labelled dot.

### Why this is the right architecture

It **reuses** what already exists (op-log, awareness, cursor renderer)
and **sidesteps the hard collab blocker**: the WebRTC/multi-instance path
crashes because a *second* editor runs WebGL + GStreamer in one process
(see `TODO.md`). The AI collaborator needs **none** of that:

- One editor process (the user's) — renders normally, no second engine.
- No WebRTC / GStreamer — the AI↔editor channel is D-Bus/MCP.
- The AI's presence/cursor are injected **locally** into an
  `AwarenessManager` whose `send` is a no-op (nothing goes on a wire).

So the collaboration investment (op-log + awareness) pays off as a
shippable product feature **without** the WebRTC pair-edit path needing to
be crash-free.

## How it maps onto existing code

| Concern | Mechanism | Reuse |
|---|---|---|
| AI edits | `Engine.executeCommand` (op-log) via `paint_tile` etc. | already there |
| AI cursor | local `AwarenessManager` + `RemoteCursorRenderer`, fed `handleInbound({type:'cursor', peerId:'ai-assistant', …})` | already there — just not session-bound |
| AI presence (name/colour) | `handleInbound({type:'presence', …})` | already there |
| Edit attribution | stamp the AI's ops with its peerId | op `peerId` field exists |
| Presence UI (roster, pause) | new small UI on top of awareness state | Phase 3 |

The one architectural move: **decouple the awareness + cursor renderer
from `CollabSession`** so a local virtual peer can publish presence/cursor
without a live session. `RemoteCursorRenderer(engine, awareness)` already
takes a plain `AwarenessManager` — so the engine owns a local one for
virtual peers.

## Phases

1. **Presence + cursor (this).** `Engine` owns a lazily-created local
   `AwarenessManager` + `RemoteCursorRenderer` for virtual peers. Control:
   `SetAssistantCursor(tileX, tileY)`, `SetAssistantInfo(name, color)`,
   `HideAssistant`. Bridge tools: `assistant_cursor` / `assistant_info` /
   `assistant_hide`. Result: the user watches a labelled "AI Assistant"
   cursor move over the map.
2. **Edit attribution (done).** When the assistant paints, the tile gets a
   brief fading outline in the assistant's colour ("AI painted here") so
   edits are visibly the AI's. Auto-gated on assistant presence
   (`Engine._flashAssistantTile`).
3. **Presence UI + control (done).** A bottom-left `FloatingAssistant`
   OSD pill (avatar + "AI Assistant" + a pause/resume button) appears when
   the assistant is present. The button drives the
   `win.toggle-assistant-paused` stateful action; while paused the engine
   rejects the assistant's cursor + paints (`Engine._assistantPaused`) and
   `get_status` reports `assistantPaused` / `assistantPresent` so the agent
   knows to stop. User stays in control.
4. **Follow-cam + activation UX (done).** An opt-in "follow the assistant"
   toggle on the pill (`win.toggle-follow-assistant` → `Engine._followAssistant`)
   pans the camera to the assistant's cursor on each move; off by default
   so the view isn't yanked around. The first time the assistant becomes
   present, a toast ("AI assistant is now editing with you") announces it —
   a clear, consent-style cue rather than a silent takeover.
5. **Unify with real collaboration.** The AI participates alongside human
   peers in a real `CollabSession` (its ops/awareness merge with the
   networked ones). Depends on the WebRTC/GL-coexistence work in `TODO.md`.

## UX / product considerations

- **Transparency + consent** — it must be obvious an AI is acting; a
  visible presence chip + a Pause/Stop control are non-negotiable for the
  end-user feature.
- **Undo attribution** — AI edits share the op-log/undo stack but are
  recognisable as the AI's.
- **Gating** — the dev path stays env-driven; the *product* path needs a
  deliberate in-app enable.
- **Cursor throttle** — `AwarenessManager` already throttles; the AI's
  cursor updates ride the same path.

## Related concepts

- [`editor-architecture.md`](editor-architecture.md) — the ECS op-log +
  awareness are the data-driven model; the AI is simply another
  participant feeding it. This is why "data-driven" matters: GTK view,
  op-log, human peers, the D-Bus/MCP control surface, **and** the AI
  collaborator are all observers/drivers of one model.
- [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md) —
  the AI collaborator is the in-process special case of the multi-peer
  design; Phase 5 merges the two.
