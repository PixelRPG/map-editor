# Action Sequencer — a list that can pause

> Status: tracked in the [phase tracker](#where-this-is-implemented) — the single source of truth for what's landed vs planned.

An event's `actions` list is authored as an ordered script. Before this design, `EventActionSystem` walked the whole list inside the `TRIGGER_FIRED` subscription and returned before the next frame drew, so `wait` was a debug log and a text box could not hold the list while the player read it.

This document decides the shape that lets a list **stop in the middle and continue later**. It is the prerequisite for the text box that waits for a button press, for choices that branch into sub-lists, for cutscenes, and for a save that knows when it is safe to write.

The one sentence the rest of this doc elaborates: **the sequencer never pauses the world — it only takes the controls.**

## The run is a component on the triggering entity

A run in progress is `ActionRunComponent`, attached to the entity whose trigger fired. The entity is the natural owner: it is already the thing the list belongs to, its lifetime is the run's lifetime, and "does this sign have a run?" is the exact question the re-trigger guard asks.

```ts
interface ActionFrame {
  actions: ActionData[]   // the list this frame is walking
  cursor: number          // index of the step to run next
}

class ActionRunComponent extends Component {
  frames: ActionFrame[]          // stack; frames[0] is the triggered list
  blocking: boolean              // whether this run holds the control lock
  pending: Pending | null        // why the current step has not finished
  by: TriggerCause               // the `by` from TRIGGER_FIRED, for debugging
}

type Pending =
  | { kind: 'timer'; remainingMs: number }   // `wait`
  | { kind: 'ack'; token: string }           // host said "show this", not yet "done"
```

**A stack, not a cursor.** A single index cannot express "jump into a choice's branch and come back", which is T4's whole requirement. A stack of frames can, and it costs one array. Entering a sub-list pushes a frame; a frame whose cursor reaches the end pops. The run ends when the stack empties.

**Exactly one step is live at a time**, across the whole stack — so `pending` sits on the run, not on the frame. That is also what makes "two lists do not interleave" a property of the data rather than a rule systems have to remember.

**A step reports one of three outcomes:**

| Outcome | Meaning | Sequencer does |
|---|---|---|
| `done` | the step finished within the tick | advance `cursor`, keep going this tick |
| `waiting` | the step set `pending` | stop this run until `pending` clears |
| `enter` | the step supplies a sub-list | push a frame, keep going this tick |

There is no `leave` outcome: leaving is what a cursor past the end of a frame means. Five of today's six action types return `done` unchanged; `wait` becomes the first real `waiting`, and T3's `show-text` becomes the second.

Steps keep their stable `id` from `ActionData`, so `{ frames, pending }` is enough to say where a run stands in a log or an inspector row.

## The lock is a component on the session singleton

`ControlLockComponent` lives on the `session-state` singleton while a blocking run is active. `InputSystem` reads it in the same place it already reads `RuntimeModeComponent` and publishes `NEUTRAL` instead of the merged intent. One reader, one hook point, no new path through the input merge.

The lock takes **intent**, not time. Combat systems, knockback, hostile AI, animation and the camera keep ticking at full rate — the hero simply stops steering. That is why a non-blocking list (`blocking: false`) is a coherent idea rather than a contradiction: it runs its steps over several ticks while the player keeps fighting.

Why a separate component rather than deriving it from "a run exists": the derivation would have to scan every entity every tick to answer a question `InputSystem` asks every tick, and it would be wrong for non-blocking runs. The lock also outlives the run by one concern — it is what a future pause menu or a modal host dialog would take — and a component that something *else* can hold is not the same object as a run.

Both components are runtime-only and are never written to a map file. They are consequences of a trigger, not authored content.

## Re-triggering while a run is active

Two guards, both in the sequencer:

1. **The entity already has an `ActionRunComponent`** → the new `TRIGGER_FIRED` is dropped. No queue, no restart. A player mashing the action button at a sign re-reads it only after the previous read ends.
2. **Any blocking run exists in the scene** → no new run starts at all, from any entity.

The second guard is not redundant. The control lock stops walk-onto triggers, because it zeroes movement — but `action-button` triggers survive it, and `auto` triggers fire at initialize. Relying on the lock to prevent interleaving would be relying on a side effect of a different feature.

Note that `TeleportSystem`, `ItemPickupSystem` and `FlagSystem` subscribe to `TRIGGER_FIRED` independently, so one trigger fans out past the action list. Those subscriptions are untouched here; the guards govern the sequencer's runs only.

A `teleport` **step** is terminal: it ends the run (and releases the lock) because the scene that owns both is about to be retired.

## Scene unload

Nothing to clean up by hand. `Engine.loadMap` builds a fresh `MapScene` with fresh systems, and `retireScene` clears the outgoing world — runs and the lock go with it, because both are components in that world and neither is referenced from anywhere outside it. This is the reason the lock is a *component on the singleton* and not a field on `InputSystem` or a module-level flag: the latter two would survive the map the run belonged to.

Within a scene, releasing the lock uses `SessionState`'s forced removal, so the controls come back in the same tick the run ends rather than one frame later — Excalibur's own `removeComponent` is deferred.

## What each peer runs

Per [`collaboration-and-multiplayer.md`](collaboration-and-multiplayer.md), a trigger arrives as an ordered op, so every peer derives the same run from the same input. Neither component goes on the wire: replicating derived state would create a second source of truth for a thing each peer can compute, and the sequencer is deterministic given the list and the ops.

The lock is **local to the peer whose player triggered the run**. In split-screen, the player who talked to the shopkeeper loses their controls; the other player keeps walking, and the world — including combat — keeps running for both. A lock broadcast to every peer would turn one player's conversation into everyone's freeze.

## Cost when idle

`EventActionSystem` stops being a subscription that does all its work in a closure and becomes a query-driven system: `world.queryManager.createQuery([ActionRunComponent])`, iterated in `onUpdate`. With no run in flight the query is empty and `onUpdate` returns on its first line — no allocation, no iteration, no event traffic. This is the same shape `StateSystem` uses.

A guard caps the steps one run may execute per tick. Without it, a list that enters a sub-list which re-enters it hangs the frame instead of stuttering, and the stack-based shape makes exactly that loop expressible.

## What this replaces

This is a migration, not an addition. Today's synchronous walk inside the `TRIGGER_FIRED` closure goes away in the same change that adds the queue — the subscription keeps only the job of *starting* a run (and the guards above). Two representations of "where the list is" must never coexist; the per-tick one is the only one afterwards.

The specs to write, each naming one behaviour that does not exist today:

- a list resumes after `wait`, at the step after it
- two lists do not interleave — a trigger during a run is dropped, not queued
- the lock releases when the run ends, and when the scene unloads
- the per-tick step guard stops a self-entering list from hanging the frame

## Open questions

- **Which peer emits the effect intents** (`SHOW_TEXT_REQUESTED` and friends) when several peers derive the same run. Deriving on all of them and presenting per-peer is the obvious reading, but split-screen presentation is unbuilt, so this is deliberately not decided here.
- **Whether a save may be taken mid-run.** The decision for now is no: *at rest* means no blocking run is active, and the save path asks exactly that question. Allowing it would require serialising `frames` and `pending`, which pins the step vocabulary into the save format.
- **Whether non-blocking lists get an authoring switch**, or stay an internal flavour used by systems that spawn runs themselves. No authored list needs one yet.

## Where this is implemented

Phase tracker — fill in as PRs land. Anything cited here must exist in the tree at the cited path.

**Phase 0 — Today's synchronous runner (replaced by Phases 1 and 2)**: the whole list used to run inside the `TRIGGER_FIRED` subscription and `wait` only logged. That walk no longer exists.

**Phase 1 — The sequencer (landed)**:
- `packages/engine/src/components/action-run.component.ts` — `ActionRunComponent` (frame stack, `pending`, `blocking`, `by`)
- `packages/engine/src/systems/event-action.system.ts` — `TRIGGER_FIRED` only starts runs (both re-trigger guards, dropped triggers logged at debug); `onUpdate` iterates a query on `ActionRunComponent` and returns on its first line when empty; `wait` is a `timer` step; `teleport` ends the run; `MAX_STEPS_PER_TICK` caps one run per tick
- `packages/engine/src/systems/event-action.system.spec.ts` — resume after `wait`, no interleaving, lock lifetime, step cap, idle
- `packages/engine/src/types/data/ActionData.ts` — the six action types, each with a stable `id` (unchanged)
- `packages/engine/src/components/event-actions.component.ts` — the authored list (unchanged)

**Phase 2 — The control lock (landed)**:
- `packages/engine/src/components/control-lock.component.ts` — `ControlLockComponent` on the session singleton, set and released through `SessionState` (forced removal)
- `packages/engine/src/systems/input.system.ts` — publishes neutral intent when the lock is present, at the same spot it checks `RuntimeModeComponent`; `input.system.spec.ts` pins it

**Phase 3b — Dialogue (landed)**: `dialogue` is `{ speaker?, lines[] }` (localized text). `TriggerSystem` fires it on the action button through the facing probe, like any trigger; `EventActionSystem` turns the lines into `show-text` steps ahead of the entity's `actions`, so a dialogue blocks, locks and drops re-triggers exactly like a list. Nothing runs per frame. Spec: `packages/engine/src/systems/dialogue-speak.spec.ts`. Old `dialogueId` data is migrated on load (`format/migrate-dialogue.ts`).

**Phase 3 — Consumers**: the waiting text box (T3) landed as the first `ack` step (`show-text` parks on `DIALOGUE_ACK` until the `DialogueSystem` emits `DIALOGUE_CLOSED`); choices and branches (T4) landed as the first `enter` step: `ask` (prompt + 2-4 options, each an action list) parks on the `ask` ack token, `AskSystem` draws the rows above the text box and emits `ASK_ANSWERED`, and the sequencer pushes the picked option's list as a frame, so the run continues after the ask when it ends. The editor card for `ask` is a follow-up.
