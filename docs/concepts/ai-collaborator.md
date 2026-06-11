# AI Collaborator — the MCP/D-Bus assistant as a live in-editor peer

> Status: tracked in the [phases](#phases) section (per-item status markers) — the single source of truth for what's landed vs planned.

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
and needs no second process at all:

- One editor process (the user's) — renders normally, no second engine,
  no WebRTC / GStreamer for the AI itself; the AI↔editor channel is
  D-Bus/MCP.
- The AI's presence/cursor are injected **locally** into an
  `AwarenessManager` whose `send` is a no-op (nothing goes on a wire) —
  and relay verbatim to remote peers when a real session is live
  (Phase 5).

So the collaboration investment (op-log + awareness) pays off as a
shippable product feature with zero extra infrastructure. (The
WebRTC pair-edit path works too — its only fragility is an
intermittent engine-init crash, see `TODO.md` — but the in-process AI
doesn't depend on it either way.)

## How it maps onto existing code

| Concern | Mechanism | Reuse |
|---|---|---|
| AI edits | `Engine.executeCommand` (op-log) via `paint_tile` etc. | already there |
| AI cursor | local `AwarenessManager` + `RemoteCursorRenderer`, fed `handleInbound({type:'cursor', peerId:'ai-assistant', …})` | already there — just not session-bound |
| AI presence (name/colour) | `handleInbound({type:'presence', …})` | already there |
| Edit attribution | visual: tile flash in the assistant's colour. **On the wire:** assistant-initiated mutations carry `Operation.origin = ASSISTANT_PEER_ID` (threaded explicitly Control → `paintTileAt`/`placeObjectAt` → `executeCommand` → `COMMAND_EXECUTED` → `Operation`), while `peerId`/`seq` stay the host's — so echo suppression and the snapshot `opWatermark` are untouched. Receivers surface it via `EngineEvent.REMOTE_COMMAND_APPLIED { command, direction, origin }`; rendering an "AI" badge from it is a UI follow-up (TODO.md). **On the undo stack:** AI edits deliberately stay on the host's stack with no marker — see § Undo attribution. | done (wire) / follow-up (UI) |
| Presence UI (roster, pause) | new small UI on top of awareness state | Phase 3 |

The one architectural move: **decouple the awareness + cursor renderer
from `CollabSession`** so a local virtual peer can publish presence/cursor
without a live session. `RemoteCursorRenderer(engine, awareness)` already
takes a plain `AwarenessManager` — so the engine owns a local one for
virtual peers.

## Phases

1. **Presence + cursor (done).** `Engine` owns a lazily-created local
   `AwarenessManager` + `RemoteCursorRenderer` for virtual peers. Control:
   `SetAssistantCursor(tileX, tileY)`, `SetAssistantInfo(name, color)`,
   `HideAssistant`. Bridge tools: `assistant_cursor` / `assistant_info` /
   `assistant_hide`. Result: the user watches a labelled "AI Assistant"
   cursor move over the map.
2. **Edit attribution (done — visual + wire).** When the assistant paints,
   the tile gets a brief fading outline in the assistant's colour ("AI
   painted here") so edits are visibly the AI's in the moment. Auto-gated
   on assistant presence (`Engine._flashAssistantTile`). On the wire,
   assistant-initiated ops additionally carry
   `Operation.origin = ASSISTANT_PEER_ID` (the initiator is an explicit
   parameter through Control → engine — no ambient "current actor" state),
   so remote peers can durably attribute them to the AI; the receive-side
   `REMOTE_COMMAND_APPLIED` event exposes it. A remote-peer attribution
   UI (badge/flash on `origin`) is a follow-up in `TODO.md`.
3. **Presence UI + control (done).** A bottom-left `FloatingCollaborators`
   OSD pill (avatar + "AI Assistant" + a pause/resume button) appears when
   the assistant is present. The button drives the
   `win.toggle-assistant-paused` stateful action and `get_status` reports
   `assistantPaused` / `assistantPresent` so the agent can stop *before*
   hitting errors. Pause is **enforced**, not advisory — every mutating
   Control method is rejected with a typed error while paused, and the
   control plane can never flip the pause action itself. Full semantics
   in [Pause contract](#pause-contract).
4. **Follow-cam + activation UX (done).** An opt-in "follow the assistant"
   toggle on the pill (`win.toggle-follow-assistant` → `Engine._followAssistant`)
   pans the camera to the assistant's cursor on each move; off by default
   so the view isn't yanked around. The first time the assistant becomes
   present, a toast ("AI assistant is now editing with you") announces it —
   a clear, consent-style cue rather than a silent takeover.
5. **Unify with real collaboration (done).** The AI participates alongside
   human peers in a real `CollabSession`: its **edits** already flow over
   the shared op-log, and its **cursor/presence** relay to remote peers via
   `AwarenessManager.relay` (a verbatim send-as-virtual-peer frame), wired
   to the live session in `ApplicationWindow._wireAssistantRelay` on the
   SessionService `state-changed` event and cleared when idle. Verified
   live: a remote joiner renders the host's "AI Assistant" cursor.
   (The WebRTC/GL "blocker" turned out to be an *intermittent* engine-init
   crash, not a fundamental incompatibility — see `TODO.md`.)

## Pause contract

Pause is the **human's** safety switch over the AI — never the other way
round. It is enforced at two layers: the Control D-Bus service rejects
every **mutating** method with a typed `assistant-paused` error (the MCP
bridge surfaces the message verbatim, so the driver learns the cause and
the way out instead of getting silence), and the engine additionally
rejects the assistant's canvas channel (`paintTileAt` / `placeObjectAt` /
`setAssistantCursor` return `false`) as defense in depth. The
classification is code + spec, not prose:
`apps/maker-gjs/src/services/assistant-pause-policy.ts` (every Control
method must be classified there — the guard throws on unclassified
names — and `assistant-pause-policy.spec.ts` pins the table).

| Surface | While paused | Who can toggle / notes |
|---|---|---|
| `GetStatus`, `Screenshot`, `ListActions`, `ListRecentProjects`, `ListTemplates`, `GetSessionState`, `PresentWindow` | **allowed** | read-only/diagnostic (`PresentWindow` is required by the bridge's screenshot retry) |
| `SetAssistantInfo`, `HideAssistant` | **allowed** | the assistant's own presence channel (labelling / explicit opt-out) |
| `SetAssistantCursor` | rejected — returns `false` | engine-gated; the bridge hint names the pause |
| `PaintTile`, `PlaceObject`, `OpenProject`, `SetZoom`, `ResizeWindow`, `StartSession`, `JoinSession`, `FollowParticipant`, `ActivateAction`, `ChangeActionState` | rejected — `assistant-paused` D-Bus error | the whole action plane counts as mutating: every `win.*` / `app.*` action mutates project data or the user's UI, so there is no per-action allowlist today |
| `win.toggle-assistant-paused` via Control (`ActivateAction` / `ChangeActionState`) | rejected — `human-only-action` error, **paused or not** | only the user toggles pause (the OSD pill / UI); the AI can never un-pause itself |
| the user's **own UI** | **unaffected** | pause gates the AI, never the human — e.g. the Props "Remove" button works while paused (`Engine.removeObject` is deliberately ungated; the assistant has no Control-side remove) |

`get_status.assistantPaused` reports the pause from the window-side
single source (correct even with no live engine), so a well-behaved
agent stops before hitting the errors. Mutating Control calls that
cannot act for *other* reasons also fail typed instead of silently
"succeeding": `no-engine` (e.g. `SetZoom`, `win.undo`, `win.play`
without an open scene) and `nothing-to-undo` / `nothing-to-redo` on
empty stacks.

## State ownership & engine recreation

The engine is **disposed on every scene-editor exit** and recreated on
re-entry, so per-engine assistant fields (`_assistantPaused`,
`_assistantInfo`, `_followAssistant`, the Phase-5 frame relay) are
push-down caches, never owners. The durable owners live window-side:
the `AssistantStateService`
(`apps/maker-gjs/src/services/assistant-state.service.ts` — presence,
name/colour, pause; the `win.toggle-assistant-paused` GAction state is
its GTK-binding mirror, written in the same handler) plus the stateful
`win.*` GActions for the view flags.

On every engine (re)creation `ApplicationWindow._syncEngineUiState()`
re-pushes the full set via `engine-state-sync.ts` (the one spec-guarded
list — a new stateful toggle belongs there): active tool
(`win.set-tool`), objects visibility (`win.toggle-objects`), grid
(`win.toggle-grid`), layer dimming (`win.toggle-transparency`),
assistant pause + identity/presence, camera-follow state, and the
assistant awareness relay (re-wired from the live session).
`win.play` is the deliberate exception: it is reset to `false` on
scene-editor exit instead (a fresh scene starts in editor mode). This
kills the old drift class where a paused assistant silently resumed
after a Cast-view detour.

## Auto-presence — external drivers always surface as the AI

A driver doesn't have to announce itself with `SetAssistantInfo` to be
visible. Every **mutating** Control method — `ActivateAction`,
`ChangeActionState`, `OpenProject`, `StartSession`, `JoinSession`,
`SetZoom`, `ResizeWindow`, `PaintTile`, `PlaceObject`,
`FollowParticipant` — calls `_surfaceAssistantActivity`
(`apps/maker-gjs/src/services/control-dbus.service.ts`), which ensures
the assistant participant exists in the roster — so the user always
sees that an AI/automation is acting, even when the driver never
introduces itself. Tile-targeted mutations additionally move the
assistant cursor onto the target tile, making the activity followable
on the map; non-spatial mutations (`ResizeWindow`, session methods)
surface presence only. Read-only methods (`GetStatus`, `Screenshot`, …)
stay silent; `HideAssistant` remains the explicit opt-out when a driver
finishes.

## Participants toolbar (roster switcher)

The bottom-left OSD bar (`FloatingCollaborators`) is not AI-specific — it
renders the **live roster** and lets the user follow any participant:

- **Roster** — the window aggregates the local AI assistant + every peer
  from the session awareness (`ApplicationWindow.getParticipants`), each as
  a colour-matched chip. A relayed AI on a joiner appears as a session peer
  with `ASSISTANT_PEER_ID`, flagged `isAI`. Exposed in `get_status`
  (`participants`, `followedPeerId`).
- **Follow** — clicking a chip follows that participant with the camera
  (`ApplicationWindow.followParticipant` → `Engine.panCameraTo` on the
  followed peer's awareness cursor; the engine self-pans for the AI). Also
  driveable via `Control.FollowParticipant` / the `follow_participant` MCP
  tool. Clicking the followed chip again stops following.
- **AI pause** lives on the same bar (shown when an AI participant is
  present).

So "watch what a collaborator is doing" works uniformly for the AI and for
human peers — the AI was just the first participant.

## UX / product considerations

- **Transparency + consent** — it must be obvious an AI is acting; a
  visible presence chip + a Pause/Stop control are non-negotiable for the
  end-user feature.
- **Undo attribution** — AI edits share the op-log/undo stack with the
  host's own edits **by design**: the AI acts inside the host's editor,
  so the human must always be able to Ctrl+Z an AI mistake with the
  ordinary undo affordance — a separate AI stack (or excluding AI ops
  from undo) would take that control away. On the wire the same edits
  ARE distinguishable (`Operation.origin = ASSISTANT_PEER_ID`); the
  local stack deliberately carries no originator marker today. If
  "undo only the AI's changes" is ever wanted, the origin already
  threaded through `executeCommand` is the seam to hang it on
  (per-entry origin on `UndoStackComponent`) — explicitly future work,
  not a gap in the current model.
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
