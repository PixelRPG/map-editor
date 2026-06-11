# Collaboration & Multiplayer — Op-Log with Host-Sequencer

> Status: tracked in the [phase plan](#phase-plan) — the single source of truth for what's landed vs planned. See also [`ai-collaborator.md`](ai-collaborator.md).

The editor will eventually let multiple users edit the same project simultaneously ("collaborative editing"). The game will eventually support **split-screen** and **networked multiplayer**. Both flows are real-time multi-peer state synchronisation. This doc commits to **one unified mechanism** for both: an **Operation Log with a host-sequencer (Player 1)**.

This is a deliberate rejection of the "CRDT for editor, host-auth for game" hybrid. The single-mechanism choice trades offline-collab capability for substantially simpler architecture, a unified mutation vocabulary, and the same code path handling editor edits, game inputs, and undo/redo.

## Why this exists

Two paths were considered before we settled on this one:

1. **CRDT (yjs / Loro) for editor + authoritative-host for game** — two sync stacks, each optimal for its workload. Loses single-vocabulary, gains offline-collab.
2. **Op-Log + host-sequencer for both** — chosen. One stack. Loses offline-collab (collab requires the host to be online), gains a single mental model that spans editor mutations, game inputs, and undo commands.

The decisive trade-off: **operations are the same shape whether you're painting a tile in the editor, walking your player on screen, or stepping back through Undo history**. The same `Operation { kind, payload }` value flows through the same pipeline. That convergence is worth the offline-collab cost.

Solo editing (single user, no peers) still works — it just doesn't engage any sync layer. Only when a second peer joins does the op-log machinery wake up.

## Key insight: collaboration and multiplayer are the same problem in different vocabularies

Both flows are:

1. Multiple peers with local state
2. Mutations happen on any peer
3. Mutations need to propagate to all peers
4. All peers should converge on the same state

Under op-log-with-host:

- Every mutation becomes an **operation** with a typed payload
- Operations go to the host (Player 1) for ordering + validation
- Host broadcasts ordered operations to every peer (including itself)
- Every peer applies operations in the order received
- Same machinery, two vocabularies (editor ops, game ops), simultaneous over multiplexed channels

## The shared substrate

Five things are the same in both flows. Built once, used twice.

### 1. ECS data shapes are the wire format

Per the workspace-wide ECS rule (`AGENTS.md` § "Engine patterns — ECS"), components are pure data — serialisable, no methods that mutate state. That means a component is **already** wire-friendly.

Operations don't carry components directly; they carry **change descriptions** that systems apply to components on receipt. But the components themselves are inherently transferable.

### 2. Stable identifiers, never runtime entity IDs

Excalibur's `Entity.id` is a runtime-assigned integer that resets per scene load. Useless for cross-peer references — peer A's entity #4 is peer B's entity #17.

Stable identifiers exist on every persistent thing: `ObjectPlacement.id` (carried at runtime by `PlacementIdComponent`), `LayerData.id`, `EntityDefinition.id`, `MapData.id`, `GameProjectData.playerActorId` (a per-peer player id is future work with multiplayer). **All operation payloads reference these exclusively** — wire keys are always stable IDs.

A workspace-wide rule, formalised in `AGENTS.md`: **no code path uses Excalibur runtime IDs as a persistent or wire key.**

### 3. WebRTC data channels for transport

Both flows run over WebRTC data channels:

- P2P, no central server (matches the "no server" requirement)
- Browser-native, GJS-supported via `@gjsify/webrtc`
- Multiple channels per connection — editor ops + game ops can multiplex without re-negotiating
- Reliable + ordered channels for op-log (mutations must arrive + apply in order)
- Unreliable channel reserved for awareness data (presence, cursors — losing one update is fine)

Initial signalling: see [§ 6 Discovery + signalling](#6-discovery--signalling) below — LAN sessions discover peers via Avahi mDNS (zero infra), cross-network sessions broker SDP via a workspace-owned `apps/signalling-server/` (GJS-runnable via gjsify, also serves as a dogfood test of `@gjsify/{ws,http}`).

### 4. Awareness layer (presence, cursors)

Both flows need "who's here, what are they doing":

- Editor: "Bob is editing dungeon, cursor at (12, 7), selected the apple-tree library entry"
- Game: "Alice's player is at (5, 3), facing right, alive"

Awareness is **separate** from the op-log. It rides over an unreliable channel because losing an awareness update is fine (the next one supersedes it). The same minimal protocol covers both flows; the payload shape is per-flow.

#### Project-op channel — project-level edits (no scene)

There's a **third** category of mutation that's neither a scene `Command` nor ephemeral awareness: **project-level data** — the cast (characters in `entityLibrary`) and sprite-sets (tilesets + appearances). These are edited in the Cast + Sheets views, where there is *no live scene/engine* (the engine only exists inside the scene editor), so a `Command` (which mutates a `Scene`) can't represent them.

They ride a dedicated **project-op** channel (`packages/engine/src/sync/project-operations.ts`), reusing the reliable op channel like the `__session/*` snapshot protocol does. Kinds are `__project/*` (`entity.upsert`, `entity.remove`, `player.set`, `meta.update`, `map.editor-data`, `spriteset.add.chunk`, `spriteset.update.chunk`, `spriteset.remove`); `isProjectOp` filters them out of both the command registry (`SessionController` skips them) and the snapshot path. Semantics are **coarse, idempotent upserts**: every library mutation re-sends the whole affected `EntityDefinition`, the receiver replaces-by-id (`applyEntityUpsert`); the single-player invariant is structural via `player.set` → `applyPlayerSet` writing `playerActorId`. Deletes (`entity.remove`, `spriteset.remove`) carry just the id. Unlike commands, project-ops do **not** land on the undo stack.

Plumbing is maker-side: `CollabSession.sendProjectOp` (stamps peer id + seq, sends on the always-present op channel — works without an attached engine) and `CollabSession.onProjectOpReceived` → `CastController.applyRemoteProjectOp` (mutates the peer's `GameProjectData`, persists, refreshes the Cast view).

**Project metadata** (name / author / version / description / `defaultTileSize`) edited in the Data view rides `__project/meta.update`: the whole `name` + `properties` bag in one op, replaced wholesale on apply (same coarse-upsert contract as `entity.upsert` — `defaultTileSize` makes this non-cosmetic). Sent by `DataController.setProjectField`; the receiving `applyRemoteProjectOp` applies via the engine's `applyProjectMetaUpdate`, persists `game-project.json`, and re-hydrates the Data view through the host (`CastController.onProjectMetaChanged`).

**Per-map editor data** (today: the atlas card position `editorData.atlasX/atlasY`) rides `__project/map.editor-data` — atlas drags happen in the atlas view with **no live scene**, so a `Command` can't represent them. The op is keyed by the map's stable `MapData.id` and carries a *partial* `MapEditorData` patch, shallow-merged on apply (`applyMapEditorData`) so future editor-data keys reuse the same kind. Sent from the maker's atlas-drag persist path; on the receiving side `applyRemoteProjectOp` patches the in-memory `MapData` and hands the map id to the host (`CastController.onMapEditorDataChanged`), which persists the map file and repositions the atlas card live.

**Sprite-set import** carries image bytes, so it can't be one op (a single SCTP send >64 KiB is silently dropped). It rides a chunked `__project/spriteset.add.chunk` transfer (`chunkSpriteSetAdd` → `SpriteSetAddReassembler`, same 16 KiB chunking as the snapshot path), surfaced via `CollabSession.sendSpriteSetAdd` / `onSpriteSetAddReceived` → `CastController.applyRemoteSpriteSetAdd` (writes the PNG + descriptor into the peer's `spritesets/`, registers the set under the *same id* so referencing characters resolve). Because the import broadcasts before the character that uses it (reliable + ordered channel), the peer has the set registered by the time the character upsert lands — no empty-preview window. **Sprite-set delete** is the inverse: a tiny `__project/spriteset.remove` (id only) via `sendProjectOp`; `applyRemoteProjectOp` drops the reference, deletes the local `<id>.png` + `<id>.json`, and refreshes every view that surfaces sprite-sets — the Cast view (character previews), the Sheets view (tileset + appearance galleries), and the Data asset list. **Sprite-set descriptor edits** (rename, animation add/edit/delete) broadcast as a chunked `__project/spriteset.update.chunk` op (`CollabSession.sendSpriteSetUpdate` → `applyRemoteSpriteSetUpdate`) — same chunking, tagged as an update so the receiver replaces the existing descriptor. **Per-tile property edits** (the Solid switch / surface on `SpriteData.tileProperties`) ride the same descriptor channel: `TilesController` delegates to `CastController.setTileSolid`/`setTileSurface`, which persist + broadcast the update; receivers refresh live collision via `Engine.refreshTileSolidsForSpriteSet`. The cast controller owns the sprite-set CRUD + broadcast for every surface; the Sheets view routes its tileset create/delete through the host and its appearance/animation edits back through the cast controller's public methods.

**Sprite-set descriptor update** — a rename, an animation edit, or a tile-property change (`sprites[].solid` / `tileProperties.surface`) — rides a chunked `__project/spriteset.update.chunk` transfer (`chunkSpriteSetUpdate` → `ChunkReassembler`; a fat tileset descriptor can exceed the SCTP ceiling too). It carries the **descriptor only, no image bytes**, surfaced via `CollabSession.sendSpriteSetUpdate` / `onSpriteSetUpdateReceived` → `CastController.applyRemoteSpriteSetUpdate`, which merges via the engine's `applySpriteSetUpdate` (the peer's descriptor lands wholesale, but the local `image` reference is pinned so a peer can't repoint our PNG), persists, refreshes the galleries, and — when a scene is open — refreshes live tile collision via `Engine.refreshTileSolidsForSpriteSet` so a peer's Solid edit applies to the open map immediately. On the send side every descriptor mutation flows through `CastController` (`renameSpriteSet`, `_mutateSheetAnimations`, `setTileSolid` / `setTileSurface` — the Tiles view's Solid/Surface switches delegate here via `TilesController`), one write+broadcast path per descriptor.

### 5. Input-source abstraction makes split-screen and network multiplayer identical

A single `InputSourceComponent` on each player entity declares where its input comes from:

```ts
class InputSourceComponent extends Component {
  constructor(public source: InputSource) { super() }
}

type InputSource =
  | { kind: 'keyboard'; bindingId: string }       // local; binding picks which key map
  | { kind: 'gamepad'; controllerIndex: number }  // local; "player 2 = controller 2"
  | { kind: 'remote'; peerId: string }            // network; host receives + applies remote peer's input frames
  | { kind: 'ai'; agentId: string }               // bot players (later)
```

The `InputSystem` reads from whichever source the player's component declares. **Local controller-2 and a remote peer's input frames look identical to the rest of the engine** — they both end up as an "intent vector" on the player entity each tick.

This is the load-bearing piece that lets multiplayer be incremental — once `InputSourceComponent` exists, "support multiplayer" is "add the `remote` variant + a snapshot-sync layer" rather than "rewrite movement".

### 6. Discovery + signalling

Two-layer service discovery, shared verbatim between editor sessions and (future) multiplayer game lobbies. Same code path, different `kind` tag.

**Layer A — LAN auto-discovery via Avahi (mDNS).** Hosts publish `_pixelrpg._tcp.local` on the local subnet using `@girs/avahi-0.6` (the GIR for the Avahi client library, available on every GNOME / systemd system). The Welcome view browses the same service type and renders any found sessions inline ("Bob's Project · pair-editing · 2/4 peers"). Click → joiner connects directly to the host's local WebRTC offer endpoint with no public relay involved.

The TXT-record schema is the contract:

| Key | Type | Meaning |
|---|---|---|
| `version` | `1` | Protocol revision. Bumped breaking. |
| `kind` | `edit` \| `play` | What this session is — pair-editing or multiplayer game. UI filters by kind. |
| `room` | `<random-8-char>` | Stable room identifier. Same value the cross-internet `pixelrpg://join/<room>` URL carries. |
| `host` | `<display-name>` | Human-readable host name (machine username by default; editable per session). |
| `project` | `<project-name>` | Display label for the project being edited / played. |
| `peers` | `<n>/<max>` | Current vs allowed peer count. |
| `started` | `<unix-ts>` | When the session opened. |

A future `gameMode=coop|versus|...` field can extend the `kind=play` variant without touching the editor flow.

**Layer B — Cross-network signalling.** When the joiner clicks a `pixelrpg://join/<room>` URL from outside the LAN, both peers connect to a small WebSocket relay (`apps/signalling-server/`, GJS-runnable via gjsify) keyed by `<room>`. The relay only forwards opaque SDP / ICE-candidate messages between the two peers — once they have each other's offer + answer, they direct-connect via WebRTC and the relay drops to idle. The relay never sees session content (end-to-end via the WebRTC DTLS layer).

Server contract:

```
WS upgrade @ /room/<roomid>?role=host|joiner
  → server creates the room on first message, expires after 5 min idle
  → messages: { type: 'sdp' | 'ice-candidate' | 'bye'; payload: unknown }
  → server fans each message to the OTHER role in the room (not back to sender)
  → on disconnect: drop room if both peers left
```

No persistence, no auth, no per-room state beyond the live socket pair. ~50 lines of TypeScript using `@gjsify/ws` + `@gjsify/http`. Deployed as a stand-alone GJS bundle; doubles as an integration test for the gjsify Soup-backed HTTP / WebSocket server APIs.

**URL scheme.** `pixelrpg://join/<roomid>` is registered as an `x-scheme-handler/pixelrpg` Desktop entry pointing at the maker binary. Clicking a join link in any browser / chat client launches the maker (or focuses the existing instance) and feeds the room id into `SessionController`. Joiner first probes Layer A — if the room is mDNS-reachable, skip the relay; otherwise fall back to Layer B.

## The op-log protocol

### Operation shape

The shipped interface (`packages/engine/src/commands/types.ts`):

```ts
interface Operation<K extends string = string, P = unknown> {
  /** Discriminator — the kind of operation (the Command's `kind`). */
  kind: K
  /** Operation-specific payload. References only stable IDs. */
  payload: P
  /** Issuing peer (provenance). */
  peerId: string
  /** Sender-assigned sequence number (see "shipped vs target" below). */
  seq: number
  /** Optional client-side id so the sender can reconcile its optimistic copy. */
  localId?: string
  /** Apply/revert discriminator — 'revert' replicates an undo; missing = 'apply'. */
  direction?: 'apply' | 'revert'
}
```

Undo replication is the `direction` field: a peer's undo re-sends the full command payload tagged `'revert'`, and receivers run `command.revert` (an earlier draft specified a `{ kind: 'revert', payload: { targetSeq } }` mirror op — superseded by the direction field, which avoids needing a host-ordered log to resolve `targetSeq` against).

### Host-sequencer: shipped v1 vs target design

**Shipped v1 is apply-on-arrival, not host-sequenced.** Each peer stamps its own locally monotonic `seq` (write-only today — receivers don't depend on it; see the note in `session-controller.ts`), sends on the reliable **ordered** channel, and every receiver applies inbound ops as they arrive. Per-channel SCTP ordering guarantees one peer's ops apply in their send order; there is **no validation, no global ordering, no conflict resolution** between peers. Two peers painting the same tile concurrently converge only because tile-paint is last-writer-wins per receiver — good enough for pair-editing, verified live.

The **target design** keeps the host (Player 1) as sequencer — receive, validate, assign global `seq`, broadcast — which is what mid-session consistency guarantees, op validation (anti-cheat for game ops), and deterministic convergence will need:

```
   Peer (non-host)              Host (Player 1)              Other Peers
        │                              │                          │
        ├─── op (no seq) ────────────▶│                          │
        │                              │                          │
        │                  validate + assign seq                  │
        │                              │                          │
        │◀───── broadcast(seq=N) ─────┼─── broadcast(seq=N) ────▶│
        │                              │                          │
   apply locally                  apply locally               apply locally
```

Under the sequencer, a non-host peer's local application stays optimistic — apply immediately, reconcile when the broadcast comes back (revert if the host rejected, re-order if the host interleaved other ops). The shipped `Operation` envelope (`peerId` + `seq`) is forward-compatible: the sequencer rewrites `seq` on receipt without changing the wire shape.

### Editor operation vocabulary

The implemented kinds (each a `Command` in `packages/engine/src/commands/`, reconstructed via `BUILT_IN_COMMANDS`):

```ts
type EditorOp =
  | { kind: 'tile.paint';    payload: { layerId, tileX, tileY, spriteId /* global id */, prev /* sprite refs before, [] = empty */ } }
  | { kind: 'tile.erase';    payload: { layerId, tileX, tileY, prev } }
  | { kind: 'object.place';  payload: { placement /* full ObjectPlacement — revert removes it */ } }
  | { kind: 'object.remove'; payload: { placement /* carried whole so revert can restore it */ } }
```

(Project-level mutations — `__project/entity.upsert` etc. — ride the project-op channel above, not the command registry.) The inventory grows as more editor mutations land: layer ops, placement move, etc. are future commands.

The `prev` fields are captured at op-creation time and ride along with the op. They serve **two** purposes:

1. **Local revert** — the issuer can restore the prior state without needing to fetch from anyone
2. **Undo** — every op carries enough information to reverse itself, so the undo stack just keeps commands with their prevs (and undo replication re-sends them with `direction: 'revert'`)

### Game operation vocabulary

```ts
type GameOp =
  | { kind: 'input.frame';    payload: { playerId, frame: number, intent: InputFrame } }
  | { kind: 'player.spawned'; payload: { playerId, tileX, tileY, facing } }
  | { kind: 'player.moved';   payload: { playerId, tileX, tileY, facing } }
  | { kind: 'object.removed'; payload: { mapId, placementId, reason: 'pickup'|'destroyed'|... } }
  | { kind: 'item.granted';   payload: { playerId, itemId, qty } }
  | { kind: 'scene.switched'; payload: { mapId, players: { playerId, tileX, tileY }[] } }
  // …
```

Note the symmetry with editor ops: every op references stable IDs, carries enough state for application, and is host-validated before broadcast.

The host **runs the simulation** locally. Non-host peers send `input.frame` ops; the host runs its physics + game systems and produces the `player.moved` / `object.removed` / `item.granted` ops as the **broadcast result**.

For non-host peers, "playing the game" is essentially watching a stream of ops + sending input ops back. Their local engine applies the broadcasts to mirror the host's state.

### Client-side prediction for game ops

For responsive feel, non-host peers run a **local prediction**: when they emit `input.frame`, they immediately apply a locally-predicted `player.moved` op. When the host's authoritative `player.moved` arrives, they reconcile (snap to host's position if it differs). Standard FPS-netcode pattern, well-understood.

Editor ops don't need prediction in the same way — they're discrete user actions, not continuous physics. Local-apply-then-await-confirm is sufficient; latency is mostly invisible because the user already moved their mouse on to the next thing.

## Solo mode (no peers)

When the user opens a project alone, no peers connect. The op-log machinery is still **engaged locally** — operations are issued, sequenced (by the local peer trivially), applied, and stacked into the undo log. They just don't broadcast anywhere.

The architectural payoff: "local solo" and "host of a session of one" are the same code path. When a second peer joins later, nothing about the local mutation flow changes — the broadcast layer just suddenly has someone to talk to.

## Replication strategy as a Component property

Each Component implicitly belongs to a replication strategy. Document the convention so the sync systems know what to ship:

```ts
// editor — replicated via editor op-log / project-ops
ObjectPlacement                  // shared (object.place / object.remove commands)
EntityDefinition (in library)    // shared (__project/entity.upsert / entity.remove)
LayerData                        // shared (no layer commands yet — joiners get layers via snapshot)
SpriteData.tileProperties        // shared (via __project/spriteset.update.chunk descriptor ops)

// game — replicated via game op-log (host-authoritative; future)
TileTransformComponent (player)  // host derives + broadcasts via player.moved
PlayerHealthComponent (future)   // host-authoritative
InventoryComponent (future)      // host-authoritative

// local-only — never on the wire
ActiveToolComponent              // per-user editor state
SpawnOverrideComponent           // per-user editor state
RuntimeModeComponent             // per-user runtime mode
EditorModeComponent              // per-user runtime mode
InputSourceComponent             // per-user; the source itself is local even if its data comes from remote
```

This isn't enforced by code today; it's a labelling convention used at PR-review time. When sync systems land they'll formalise.

## What we DON'T do

Decisions captured here so future PRs don't relitigate:

- **No CRDT** — neither yjs nor Loro. The op-log mechanism is **not** a CRDT; it relies on the host to order operations rather than letting them merge commutatively. If we ever want offline-collab merges, we'd revisit. (See Open questions.)
- **No Operational Transform proper** — OT requires symbol-level operation rewriting. Op-log with host-sequencer is simpler: ops are atomic, host validates + orders, never rewrites.
- **No lockstep multiplayer** — would require bit-exact determinism across architectures. Host-authoritative is enough.
- **No rollback-netcode** — killer feature for fighting games; overkill for our tile-based RPG.
- **No dedicated server** — Player 1 hosts, per requirement.
- **No P2P mesh game state** — authority is centralised to Player 1; other peers are clients.
- **No mid-stream editor schema migration** — if the project file format changes between sessions, peers must agree on the schema before joining (host's schema wins; mismatched peers reject the connection with an explicit upgrade message).

## Solo-edit ↔ collab transitions

The user spec: "Solo-Editing soll gehen, aber Collab nur online".

Three transitions matter:

1. **Solo → Collab (as host)** — user invites a peer. Local peer becomes host. The op-log already exists (all solo ops have local seqs). On peer-join, host sends full project snapshot at current `seq`, then continues broadcasting subsequent ops. The new peer has the same state.

2. **Solo → Collab (as joiner)** — user joins another peer's session. Their local project is **closed first** with a save prompt; the joined session's project supersedes the local one. We do not attempt to merge a local-edited offline project with a remote session — that's CRDT territory we explicitly declined.

3. **Collab → Solo** — host's session ends (host disconnect or host explicitly closes session). Non-host peers fall back to their local state at the last-applied `seq`. They can save it as a project file. They cannot edit further until another host appears or they themselves become host.

Failure mode: **host drops mid-edit**. Non-host peers see a "host disconnected" toast. Their local state is intact. They can: (a) save the current state as a new project, (b) wait for host to rejoin (the same peer reclaims host, ops resume from the next seq), or (c) one of the remaining peers becomes the new host (host migration; complex, deferred to a later phase).

## Pair-Editing UX (v1)

v1 ships the simplest collaboration shape: **ad-hoc pair-editing**, optimised for "I'm working on something, come look + edit with me." Inspired by the Figma flow but kept minimal — no Discord, no permission roles, no voice. Two flows:

### Host invites

1. User has a project open in the maker. Window header gains an **Avatar + "Share"** button next to the existing actions.
2. Click "Share" → a popover opens with:
   - A 6-char room code (`a3f2-bb91`) and a copyable `pixelrpg://join/a3f2-bb91` link
   - The host's display name (editable; defaults to `$USER`)
   - A toast confirming "LAN discovery active" — peers on the same network see this session in their Welcome view without needing the link.
3. The maker starts the local WebRTC offer endpoint, publishes the Avahi mDNS service, and (optionally, behind a "Allow internet joiners" toggle in the popover) opens a websocket to the signalling-server keyed by the room id.

### Joiner joins

Three entry points, all converging on the same `SessionController.join(roomId)` call:

1. **LAN auto-discovery** — Welcome view has a "Sessions on this network" pane below "Recent projects". Renders any `_pixelrpg._tcp.local` services found, one row per session. Click → join.
2. **Paste link in Welcome view** — a "Join session" entry field accepts the full `pixelrpg://join/<roomid>` URL or just the bare room id.
3. **Click a `pixelrpg://join/...` URL** in any browser / chat client → the `x-scheme-handler/pixelrpg` Desktop entry launches the maker (or focuses the existing instance) and pre-fills the room id.

On join, the joiner's current project (if any) is closed with a save prompt; the host's project supersedes (matches the "Solo → Collab (as joiner)" transition rule above).

**The pre-attach window.** The joiner flow is: connect → request snapshot → write the sandbox to disk → load the project → open the scene → engine init (seconds; occasionally retried) → `CollabSession.attachEngine`. Scene Command ops are only consumed by the `SessionController` built in `attachEngine`, so a host paint / place / undo delivered during that window would be lost without further machinery. `CollabSession` therefore buffers every inbound non-protocol, non-project op from construction (`PreAttachOpBuffer`, capped defensively at a few thousand ops with drop-oldest + warn) and replays the buffer through the fresh controller on attach, in arrival order, before live ops resume. Dedupe against the snapshot rides a watermark: the host stamps `ProjectSnapshot.opWatermark` (its next command `seq`, read synchronously at capture **start** — a command is applied locally before its op is sequenced, so everything below the watermark is guaranteed inside the snapshot) and the joiner skips buffered host ops below it. A command the host executes *during* its async capture can be both inside the snapshot and replayed — safe because every built-in command's apply converges under re-apply (paint/erase set absolute state; place/remove key on stable placement ids).

### During the session

- **Header avatar bubbles** — up to 5 peer avatars + "+N" overflow. Each is colour-coded to that peer's id; the colour also tints their cursor + selection-highlight on the map. Click a bubble → camera jumps to that peer's current viewport.
- **Live cursors** — every peer's pointer position renders as a labelled arrow on the map and (less prominently) on the atlas / cast / tiles views. Awareness-channel only (unreliable, throttled to 10 Hz per peer per § "Awareness payload size" open question).
- **Selection highlights** — the tile / placement another peer has selected gets a coloured ring in their avatar colour, so two users don't simultaneously edit the same thing without knowing.
- **No soft-locks, no approval prompts** — anyone can paint anything. Concurrent edits on the same tile currently resolve last-writer-wins per receiver (apply-on-arrival); host-sequencer ordering + a `[PeerName] painted here first` toast for the loser are part of the target design above.
- **No voice, no chat** — out of scope for v1. The unreliable channel is reserved for awareness only.

### Leaving

- **Joiner closes** the window or hits "Leave session" → the session continues on the host's side. The joiner's local state at the last-applied seq is offered as a save-as.
- **Host closes** → all joiners get a "session ended" toast + save-as prompt. Local maker instances continue in solo mode.
- **Host crashes / drops** → joiners see "host disconnected" toast. State preserved locally. v1 does NOT auto-promote a joiner to host (Phase 8 — host migration, explicitly deferred).

### Out of v1 scope

| Feature | When |
|---|---|
| Permission roles (Owner / Editor / Viewer) | Future doc revision; today everyone who joins can edit |
| Per-scene soft-locks | Future, after first heuristic study of real-world conflicts |
| Voice / text chat | Future, behind a toggle — uses the same WebRTC connection |
| Comment pins / async annotations | Future — that's persistent-session territory, not ad-hoc pair-editing |
| Multi-room (one peer in N sessions) | Future — v1 enforces single-session-per-maker |

## Phase plan

Most "shared substrate" work happens *implicitly* as we land the earlier object-system and editor-architecture phases (constraint enforcement at PR-review time). The dedicated phases are the actual collab + multiplayer features.

| # | Scope | Status |
|---|---|---|
| 0 | **Substrate constraints** in earlier PR series — stable IDs audited, mutation API operation-oriented, `InputSourceComponent` introduced when player-movement lands, project schema kept transport-friendly (stable keys in arrays, no circular refs, JSON-serialisable) | **landed (substrate)** (folded into editor-architecture Phases 2–5) |
| 1 | Op-log skeleton in `packages/engine/src/commands/types.ts` — `Operation`-shape, local sequencer (`UndoStackComponent.cursor`), `Command` applier. Solo mode only (no wire). | **landed** |
| 2 | Editor op vocabulary — `PaintTileCommand` + `EraseTileCommand` are the first entries; the op-log IS the undo log via `Engine.executeCommand` + `undo` + `redo`. Hook into `editor-architecture.md` Phase 5 is now bi-directional reference. | **landed** (initial vocab; grows as more editor mutations land) |
| 3a | **LAN + relay signalling** — `lan-signalling.ts` (in-app WebSocket server over `@gjsify/{ws,http}`) + `relay-signalling.ts` (relay client) + the standalone `apps/signalling-server/` relay. Room-keyed, stateless. | **landed** (LAN verified; relay server + client built, but the default relay endpoint is a placeholder — no deployed relay, so `session-service.ts` skips it) |
| 3b | **`packages/engine/src/sync/`** — `PeerSession` wrapping `@gjsify/webrtc` `RTCPeerConnection` + `RTCDataChannel`; reliable (op) + unreliable (awareness) channels. Platform-indep. | **landed** |
| 3c | **`apps/maker-gjs/src/services/lan-discovery.ts`** — Avahi publish + browse. Welcome-view "Sessions on this network" pane + Share dialog. | **landed** |
| 3d | **Op-log broadcast** — `SessionController` relays `COMMAND_EXECUTED`/`COMMAND_REVERTED` onto `PeerSession`; inbound ops feed `applyRemoteCommand`/`applyRemoteRevert`. **Verified live: host paint → joiner sync.** | **landed** |
| 3e | **Join-by-room-id + snapshot-on-join** — `SessionService.joinByRoomId` + `SnapshotExchange` (host captures full project, chunked over the wire; joiner sandboxes + loads). Pre-attach window covered: `PreAttachOpBuffer` buffers scene Command ops until `attachEngine`, replays in arrival order, deduped via the snapshot's `opWatermark`. LAN path verified. | **landed** (LAN); `pixelrpg://` URL parse/build shipped (`pixelrpg-url.ts`) — the `x-scheme-handler` `.desktop` registration + a deployed relay are still pending |
| 4 | Editor awareness layer — live cursors, presence, **per-peer selection outlines in the peer's colour** (`colourForPeer`), participants toolbar w/ follow-camera, + an in-process AI collaborator. | **landed** |
| 5 | `InputSourceComponent` runtime + local split-screen support. | planned |
| 6 | Game op vocabulary + host-authoritative simulation + snapshot-on-join. | planned |
| 7 | Client-side prediction + reconciliation for game ops. | planned |
| 8 | Host migration on disconnect (the hard one). | deferred |

## Where this is implemented

- **Op-log / commands** — `packages/engine/src/commands/` (`types.ts` `Command`/`Operation`, `paint-tile.command.ts`, `object-placement.command.ts`, `registry.ts`). New mutations MUST register here — enforced by `registry.spec.ts` (auto-discovery) + CI.
- **Sync layer** — `packages/engine/src/sync/`: `peer-session.ts` (WebRTC), `session-controller.ts` (op-log ↔ peer bridge), `awareness.ts` + `remote-cursor-renderer.ts` (cursors + per-peer selection), `snapshot-exchange.ts` + `project-snapshot.ts` (snapshot-on-join, incl. `opWatermark`), `pre-attach-op-buffer.ts` (joiner pre-attach buffering + watermark dedupe), `project-operations.ts` (`__project/*` cast / sprite-set / project-meta / map-editor-data sync), `in-memory-transport.ts` (test harness/fakes).
- **Project-op wiring (maker)** — `apps/maker-gjs/src/services/collab-session.ts` (`sendProjectOp` / `onProjectOpReceived` for entities; `sendSpriteSetAdd` / `onSpriteSetAddReceived` + `sendSpriteSetUpdate` / `onSpriteSetUpdateReceived` + reassemblers for chunked sprite-set transfers) ↔ `cast-controller.ts` (`applyRemoteProjectOp` / `applyRemoteSpriteSetAdd` / `applyRemoteSpriteSetUpdate` + per-mutation broadcast; `tiles-controller.ts` delegates Solid/Surface edits here), wired in `application-window.ts` `_wireAssistantRelay`.
- **App orchestration** — `apps/maker-gjs/src/services/`: `session-service.ts` (lifecycle state machine), `collab-session.ts` (per-session wiring: cursor + selection broadcast, `colourForPeer`), `lan-discovery.ts` / `lan-signalling.ts` / `relay-signalling.ts`.
- **AI collaborator** — `Engine` assistant API + `apps/maker-gjs/src/widgets/editor` `FloatingCollaborators`; see [`ai-collaborator.md`](ai-collaborator.md).
- **Enforcement** — the collaboration contract is stated in the repo-root `AGENTS.md` ("Transport-ready primitives", constraints 2 + 5 + the litmus), and `@pixelrpg/engine`'s test suite (collab round-trip + registry-completeness) runs in CI.

## Related concepts

- [`editor-architecture.md`](editor-architecture.md) — the operation-oriented mutation API + `Command` interface defined there **IS** the editor op vocabulary. Phase 5 (Undo) implicitly designs the editor op-log for us. Phase 0 constraints in this doc fold back into editor-architecture's migration phases.
- [`runtime-modes.md`](runtime-modes.md) — Live Run and Test Run share a single peer's simulation; they're not multiplayer-aware. Full Run with multiplayer is where the game op-log machinery activates. The mode markers themselves are local-only — `EditorMode` / `RuntimeMode` / `SpawnOverride` never replicate.
- [`object-system.md`](object-system.md) — stable identifiers (`ObjectPlacement.id`, `EntityDefinition.id`) are the load-bearing primitive for editor op payloads. The transport-compatibility constraint covered in Phase 0 means future schema changes must preserve "stable keys in array-shaped collections, no circular refs, JSON-serialisable everywhere".

## Open questions

- **Loro as a future option for offline-collab** — Loro runs unmodified under GJS via gjsify (confirmed 2026-05-30 against the `@gjsify/integration-loro-crdt` test suite — no patches, no shims, no GJS-specific code paths needed). The "does it work?" question is answered; the open question is now "is the single-mechanism trade-off still right?" If we ever want offline-collab merges, we'd revisit using Loro for **just the editor flow** while keeping op-log for the game. This would lose the "single mechanism" property but regain offline-collab. The op-log design above does not preclude this — it'd be a parallel sync layer for editor ops, while game ops stay on op-log.
- **Op validation strictness** — how aggressively does the host re-check editor ops? For `tile.paint`, the host could just trust the `prev` matches its state (cheap) or could ignore the prev and just apply (cheapest). For game ops like `item.granted`, the host MUST validate (player position vs item position) to prevent cheating. The line gets blurry for editor ops that affect game-relevant state. Default proposal: editor ops trust-then-broadcast (cheap), game ops validate-then-broadcast (strict).
- **Op compression for large mutations** — `object.place` with a fully-inline definition is ~500 bytes. A user dragging a stamp of 50 placements over a map issues 50 such ops. Worth batching? Probably yes — a `batch` op that wraps an array of sub-ops, applied atomically. Defer until benchmarks show it matters.
- **Awareness payload size** — cursor updates at 30 Hz × N peers can flood the unreliable channel. Throttle to 10 Hz client-side; only send when the cursor actually moved. Track when implementing Phase 4.
- **Persistence format vs op-log** — the project file on disk is the current state, not an op-log. On save, we serialise the current state (just like today). On load, we initialise the op-log at `seq=0` with the loaded state. Mid-session ops accumulate after that. Do we ever persist the op-log itself (e.g. for "session replay" / debugging)? Default proposal: no in v1, optional debug-only flag later.
- **Host migration when Player 1 drops** — Phase 8. Non-trivial: requires election protocol between remaining peers + state-snapshot-from-loser. Acceptable to defer; in v1, host disconnect ends the collab session and peers fall back to local state.
- **Concurrent edits in the millisecond window** — two peers paint the same tile at nearly the same time, both apply locally, then the host orders them. The later one wins (host applies in receive order); the loser sees their local state snap to the winner. This is the right answer for collab (it's deterministic + the loser's tile is preserved in their undo log) but worth flagging in the user UI as a brief flicker on the loser's screen.
