# Collaboration & Multiplayer — Op-Log with Host-Sequencer

> Status: **planning** — design captured before implementation so the architectural constraints inform earlier PRs.
> Last meaningful change: 2026-05-22.

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

Stable identifiers exist on every persistent thing: `ObjectPlacement.id`, `LayerData.id`, `ObjectDefinition.id`, `MapData.id`, future `PlayerIdComponent.id`. **All operation payloads reference these exclusively** — wire keys are always stable IDs.

A workspace-wide rule, formalised in `AGENTS.md`: **no code path uses Excalibur runtime IDs as a persistent or wire key.**

### 3. WebRTC data channels for transport

Both flows run over WebRTC data channels:

- P2P, no central server (matches the "no server" requirement)
- Browser-native, GJS-supported via `@gjsify/webrtc`
- Multiple channels per connection — editor ops + game ops can multiplex without re-negotiating
- Reliable + ordered channels for op-log (mutations must arrive + apply in order)
- Unreliable channel reserved for awareness data (presence, cursors — losing one update is fine)

Initial signalling: the only place a server-like component exists. Options remain open — own tiny signalling endpoint, public service, or QR-code copy/paste for full-no-server LAN play.

### 4. Awareness layer (presence, cursors)

Both flows need "who's here, what are they doing":

- Editor: "Bob is editing dungeon, cursor at (12, 7), selected the apple-tree library entry"
- Game: "Alice's player is at (5, 3), facing right, alive"

Awareness is **separate** from the op-log. It rides over an unreliable channel because losing an awareness update is fine (the next one supersedes it). The same minimal protocol covers both flows; the payload shape is per-flow.

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

## The op-log protocol

### Operation shape

```ts
interface Operation<K extends string = string, P = unknown> {
  /** Discriminator — the kind of operation. */
  kind: K
  /** Operation-specific payload. References only stable IDs. */
  payload: P
  /** Issuing peer (set by sender, used by host for validation + provenance). */
  peerId: string
  /** Host-assigned sequence number (set by host before broadcast). */
  seq: number
  /** Optional client-side id so the sender can reconcile its optimistic copy. */
  localId?: string
}
```

The `seq` field is the load-bearing primitive. The host assigns it monotonically. Every peer applies operations strictly in `seq` order, no skipping. This gives us:

- **Deterministic state** — every peer's view converges given the same op sequence
- **Mid-session join** — host sends full snapshot at `seq=N`, then catches new peer up with all ops after N
- **Validation** — host rejects ops whose preconditions don't hold against its own state, never broadcasts them
- **Undo** — local undo is just "emit a Revert operation" — same wire machinery

### The host-sequencer flow

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

Non-host peer's local optimistic application happens **immediately** — the peer applies the op against its local state before sending, then reconciles when the broadcast comes back. If the host rejected the op (validation failed), the peer reverts. If the host accepted it but ordered other ops in between, the peer revises its local state to match host order.

This is the same pattern that web frameworks call "optimistic UI": local feel-fast, host arbitrates eventually-consistent reconciliation.

### Editor operation vocabulary

A representative set; the full inventory grows as the editor gains features.

```ts
type EditorOp =
  | { kind: 'tile.paint';     payload: { mapId, layerId, tileX, tileY, spriteSetId, spriteId, prev: PrevSpriteRef|null } }
  | { kind: 'tile.erase';     payload: { mapId, layerId, tileX, tileY, prev: PrevSpriteRef } }
  | { kind: 'placement.add';  payload: { mapId, placement: ObjectPlacement } }
  | { kind: 'placement.move'; payload: { mapId, placementId, tileX, tileY, prev: { tileX, tileY } } }
  | { kind: 'placement.remove'; payload: { mapId, placementId, prev: ObjectPlacement } }
  | { kind: 'layer.add';      payload: { mapId, layer: LayerData } }
  | { kind: 'layer.reorder';  payload: { mapId, layerId, beforeLayerId: string|null, prev: { beforeLayerId: string|null } } }
  | { kind: 'library.upsert'; payload: { definition: ObjectDefinition, prev: ObjectDefinition|null } }
  | { kind: 'library.remove'; payload: { definitionId: string, prev: ObjectDefinition } }
  // … and one more, the universal mirror:
  | { kind: 'revert';         payload: { targetSeq: number } }  // host reverses op at seq=N
```

The `prev` fields are captured at op-creation time and ride along with the op. They serve **two** purposes:

1. **Local revert** — if the host rejects the op, the issuer can restore the prior state without needing to fetch from the host
2. **Undo** — every op carries enough information to reverse itself, so the Undo system just stacks ops with their prevs

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
// editor — replicated via editor op-log
ObjectPlacement                  // shared
ObjectDefinition (in library)    // shared
LayerData                        // shared
SpriteData.tileProperties        // shared (via library.upsert ops on the spriteset)

// game — replicated via game op-log (host-authoritative)
TileTransformComponent (player)  // host derives + broadcasts via player.moved
PlayerHealthComponent (future)   // host-authoritative
InventoryComponent (future)      // host-authoritative

// local-only — never on the wire
ActiveToolComponent              // per-user editor state
GhostSpawnComponent              // per-user editor state
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

## Phase plan

Most "shared substrate" work happens *implicitly* as we land the earlier object-system and editor-architecture phases (constraint enforcement at PR-review time). The dedicated phases are the actual collab + multiplayer features.

| # | Scope | Status |
|---|---|---|
| 0 | **Substrate constraints** in earlier PR series — stable IDs audited, mutation API operation-oriented, `InputSourceComponent` introduced when player-movement lands, project schema kept transport-friendly (stable keys in arrays, no circular refs, JSON-serialisable) | **landed (substrate)** (folded into editor-architecture Phases 2–5) |
| 1 | Op-log skeleton in `packages/engine/src/commands/types.ts` — `Operation`-shape, local sequencer (`UndoStackComponent.cursor`), `Command` applier. Solo mode only (no wire). | **landed** |
| 2 | Editor op vocabulary — `PaintTileCommand` + `EraseTileCommand` are the first entries; the op-log IS the undo log via `Engine.executeCommand` + `undo` + `redo`. Hook into `editor-architecture.md` Phase 5 is now bi-directional reference. | **landed** (initial vocab; grows as more editor mutations land) |
| 3 | WebRTC transport + minimal signalling. Host detection. Op-broadcast. | planned |
| 4 | Editor awareness layer — live cursors, presence, per-peer selection outlines. Rides on the unreliable channel. | planned |
| 5 | `InputSourceComponent` runtime + local split-screen support. | planned |
| 6 | Game op vocabulary + host-authoritative simulation + snapshot-on-join. | planned |
| 7 | Client-side prediction + reconciliation for game ops. | planned |
| 8 | Host migration on disconnect (the hard one). | deferred |

## Where this is implemented

Filled in as phases land. Currently empty — Phase 0 constraints are enforced via review against the rules in this doc.

## Related concepts

- [`editor-architecture.md`](editor-architecture.md) — the operation-oriented mutation API + `Command` interface defined there **IS** the editor op vocabulary. Phase 5 (Undo) implicitly designs the editor op-log for us. Phase 0 constraints in this doc fold back into editor-architecture's migration phases.
- [`runtime-modes.md`](runtime-modes.md) — Live Run and Test Run share a single peer's simulation; they're not multiplayer-aware. Full Run with multiplayer is where the game op-log machinery activates. The mode markers themselves are local-only — `EditorMode` / `RuntimeMode` / `GhostSpawn` never replicate.
- [`object-system.md`](object-system.md) — stable identifiers (`ObjectPlacement.id`, `ObjectDefinition.id`) are the load-bearing primitive for editor op payloads. The transport-compatibility constraint covered in Phase 0 means future schema changes must preserve "stable keys in array-shaped collections, no circular refs, JSON-serialisable everywhere".

## Open questions

- **Loro as a future option for offline-collab** — Loro is currently being evaluated as a gjsify integration test (separate workstream). If Loro proves stable + WebRTC-capable + offline-merge-mature, we may revisit using it for **just the editor flow** while keeping op-log for the game. This would lose the "single mechanism" property but regain offline-collab. Decide once the gjsify integration test reports. The op-log design above does not preclude this — it'd be a parallel sync layer for editor ops, while game ops stay on op-log.
- **Op validation strictness** — how aggressively does the host re-check editor ops? For `tile.paint`, the host could just trust the `prev` matches its state (cheap) or could ignore the prev and just apply (cheapest). For game ops like `item.granted`, the host MUST validate (player position vs item position) to prevent cheating. The line gets blurry for editor ops that affect game-relevant state. Default proposal: editor ops trust-then-broadcast (cheap), game ops validate-then-broadcast (strict).
- **Op compression for large mutations** — `placement.add` with a fully-inline definition is ~500 bytes. A user dragging a stamp of 50 placements over a map issues 50 such ops. Worth batching? Probably yes — a `batch` op that wraps an array of sub-ops, applied atomically. Defer until benchmarks show it matters.
- **Awareness payload size** — cursor updates at 30 Hz × N peers can flood the unreliable channel. Throttle to 10 Hz client-side; only send when the cursor actually moved. Track when implementing Phase 4.
- **Persistence format vs op-log** — the project file on disk is the current state, not an op-log. On save, we serialise the current state (just like today). On load, we initialise the op-log at `seq=0` with the loaded state. Mid-session ops accumulate after that. Do we ever persist the op-log itself (e.g. for "session replay" / debugging)? Default proposal: no in v1, optional debug-only flag later.
- **Host migration when Player 1 drops** — Phase 8. Non-trivial: requires election protocol between remaining peers + state-snapshot-from-loser. Acceptable to defer; in v1, host disconnect ends the collab session and peers fall back to local state.
- **Concurrent edits in the millisecond window** — two peers paint the same tile at nearly the same time, both apply locally, then the host orders them. The later one wins (host applies in receive order); the loser sees their local state snap to the winner. This is the right answer for collab (it's deterministic + the loser's tile is preserved in their undo log) but worth flagging in the user UI as a brief flicker on the loser's screen.
