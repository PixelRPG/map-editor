import type { Command } from '../commands/types.ts'
import type { Facing } from './data/index.ts'
import type { EngineStatus } from './engine-status.ts'
import type { ProjectLoadOptions } from './project-options.ts'

/**
 * Engine event names emitted via the engine's EventEmitter.
 */
export enum EngineEvent {
  STATUS_CHANGED = 'status-changed',
  PROJECT_LOADED = 'project-loaded',
  MAP_LOADED = 'map-loaded',
  ERROR = 'error',
  TILE_CLICKED = 'tile-clicked',
  TILE_HOVERED = 'tile-hovered',
  TILE_PLACED = 'tile-placed',
  TILE_PICKED = 'tile-picked',
  PLACEMENT_SELECTED = 'placement-selected',
  PLAYER_TILE_CHANGED = 'player-tile-changed',
  PLAYER_ACTION_PRESSED = 'player-action-pressed',
  TRIGGER_FIRED = 'trigger-fired',
  WALKED_ONTO_TILE = 'walked-onto-tile',
  TELEPORT_REQUESTED = 'teleport-requested',
  ITEM_PICKED_UP = 'item-picked-up',
  DAMAGE_DEALT = 'damage-dealt',
  ENTITY_DEFEATED = 'entity-defeated',
  EXPERIENCE_GAINED = 'experience-gained',
  LEVEL_UP = 'level-up',
  SHOW_TEXT_REQUESTED = 'show-text-requested',
  FLAG_SET = 'flag-set',
  PLAY_SFX_REQUESTED = 'play-sfx-requested',
  POINTER_TAP = 'pointer-tap',
  POINTER_DRAG_START = 'pointer-drag-start',
  POINTER_DRAG_MOVE = 'pointer-drag-move',
  POINTER_DRAG_END = 'pointer-drag-end',
  COMMAND_EXECUTED = 'command-executed',
  COMMAND_REVERTED = 'command-reverted',
  REMOTE_COMMAND_APPLIED = 'remote-command-applied',
  LAYER_FLAG_CHANGED = 'layer-flag-changed',
  LAYER_LIST_CHANGED = 'layer-list-changed',
}

export interface EngineEventMap {
  [EngineEvent.STATUS_CHANGED]: { status: EngineStatus }
  [EngineEvent.PROJECT_LOADED]: { projectPath: string; options?: ProjectLoadOptions }
  [EngineEvent.MAP_LOADED]: { mapId: string }
  [EngineEvent.ERROR]: { message: string; cause?: Error }
  [EngineEvent.TILE_CLICKED]: { coords: { x: number; y: number }; tileMapId: string }
  [EngineEvent.TILE_HOVERED]: { coords: { x: number; y: number } | null; tileMapId: string }
  [EngineEvent.TILE_PLACED]: { coords: { x: number; y: number }; tileId: number; layerId: string }
  /**
   * Emitted by `TileEditorSystem` when the user clicks a tile with
   * the eyedropper tool active. Carries enough info for the host to
   * (a) push the picked sprite into `ActiveTileComponent` via its
   * existing local→global flow and (b) optionally auto-switch back
   * to a paint tool. Engine deliberately does NOT mutate
   * `ActiveTileComponent` / `ActiveToolComponent` itself — the host
   * owns the tile-palette UI sync (highlight + context chip
   * preview) so it has to drive the write.
   *
   * `globalTileId` is provided for hosts that don't track the sheet's
   * `firstGid` themselves; `spriteSetId` + `localSpriteId` for hosts
   * that need to detect a sheet switch.
   */
  [EngineEvent.TILE_PICKED]: {
    coords: { x: number; y: number }
    layerId: string
    spriteSetId: string
    localSpriteId: number
    globalTileId: number
  }
  /**
   * Emitted by `TileEditorSystem` when the user clicks the canvas
   * with the `'select'` tool active. `placementId` is the stable id
   * of the picked object (matching `ObjectPlacement.id`) or `null`
   * when the click landed on empty tile space — the host treats
   * `null` as "clear the inspector selection". The component-side
   * selection state (`SelectedPlacementsComponent`) is mutated
   * directly by the system; this event is purely for UI sync (the
   * objects-tab needs to highlight the matching row, the engine
   * itself doesn't surface inspector state).
   */
  [EngineEvent.PLACEMENT_SELECTED]: {
    placementId: string | null
    coords: { x: number; y: number }
  }
  /**
   * Emitted by {@link PlayerSystem} whenever the player crosses a
   * tile boundary. `TriggerSystem` listens on this to fire walk-onto /
   * walk-off triggers, `WalkOnTileSystem` to resolve tile properties.
   *
   * Decoupled from sprite-pixel position — game-specific movement code
   * (smooth sliding, jumping, grid-snapped) can all emit this exactly
   * when the *logical* tile changes.
   */
  [EngineEvent.PLAYER_TILE_CHANGED]: {
    tileX: number
    tileY: number
    /** Previous tile, or `null` if this is the initial spawn. */
    previous: { tileX: number; tileY: number } | null
    facing?: Facing
  }
  /**
   * Emitted by {@link PlayerSystem} when the player presses the action
   * button. `facing` resolves the adjacent tile that the `TriggerSystem`
   * scans for `action-button`-mode triggers.
   */
  [EngineEvent.PLAYER_ACTION_PRESSED]: { tileX: number; tileY: number; facing: Facing }
  /**
   * Emitted by `TriggerSystem` when a trigger condition is met.
   * Listeners narrow by component (TeleportComponent / ItemComponent
   * / …) on the firing entity to decide whether to act.
   */
  [EngineEvent.TRIGGER_FIRED]: { entityId: number; by: 'walk-onto' | 'walk-off' | 'action-button' | 'auto' }
  /**
   * Emitted by `WalkOnTileSystem` when the player steps onto a new
   * tile — carries the resolved `TileProperties` from the
   * sprite-set so audio / encounter / blocker systems can react.
   */
  [EngineEvent.WALKED_ONTO_TILE]: {
    tileX: number
    tileY: number
    properties: Record<string, unknown>
  }
  /**
   * Emitted by `TeleportSystem` when a teleport entity is
   * triggered. The host engine listens for this and performs the
   * scene-switch + player re-position (engine has no reference to
   * the player itself, project code resolves which actor to move).
   */
  [EngineEvent.TELEPORT_REQUESTED]: {
    targetMapId: string
    targetTileX: number
    targetTileY: number
    facing?: Facing
  }
  /**
   * Emitted by `ItemPickupSystem` when a player triggers an
   * item-bearing entity. The maker host surfaces it as a playtest toast
   * today; a real inventory system (add the item) is future work.
   */
  [EngineEvent.ITEM_PICKED_UP]: {
    itemId: string
    qty: number
    pickupSound?: string
  }
  /**
   * A hit landed. Emitted by `combat-action`'s damage sources
   * (`MeleeAttackSystem` for a swing, `HostileAiSystem` for contact) and
   * folded into live hit points by `stats`' `StatsSystem`.
   *
   * `amount` is the RAW damage — attacker's weapon plus its `attack`
   * stat. Mitigation by the target's `defense` happens in `StatsSystem`,
   * because `defense` is a `stats` field and `stats` is the system that
   * gets to say what it means.
   *
   * `targetId` / `sourceId` are Excalibur runtime entity ids: this is a
   * local per-scene bus event, never a wire message or a save key (the
   * same footing as `TRIGGER_FIRED`). Transport rule 1 still holds — no
   * persisted key is derived from them.
   */
  [EngineEvent.DAMAGE_DEALT]: { targetId: number; amount: number; sourceId?: number }
  /**
   * An actor's hit points reached zero. Emitted by `StatsSystem`, which
   * owns hit points; acted on by `combat-action`'s `DefeatSystem`, which
   * decides what a defeated body does (drop, reward, respawn).
   *
   * The split is deliberate: "hp hit zero" is a stats fact and stays true
   * whichever combat system is on, while "it drops a heart and comes back
   * in five seconds" is one combat system's rule.
   */
  [EngineEvent.ENTITY_DEFEATED]: { entityId: number }
  /**
   * Experience awarded to an actor — emitted by `DefeatSystem` when a
   * hostile pays out, folded by `StatsSystem` into `exp` / `level`.
   */
  [EngineEvent.EXPERIENCE_GAINED]: { entityId: number; amount: number }
  /**
   * Emitted by `StatsSystem` when accumulated experience crossed
   * `expToNext`. The maker host surfaces it as a playtest toast, the same
   * treatment `FLAG_SET` and `ITEM_PICKED_UP` get.
   */
  [EngineEvent.LEVEL_UP]: { entityId: number; level: number }
  /**
   * Emitted by `EventActionSystem` for a `show-text` action. The maker
   * host surfaces the line as a playtest toast today (no store yet — the
   * text is inline); a real in-game dialogue / text-box overlay is
   * future work.
   */
  [EngineEvent.SHOW_TEXT_REQUESTED]: { text: string; speaker?: string }
  /**
   * Emitted by `EventActionSystem` for a `set-flag` action — the write
   * side of the (future) game-flags store that gates entity states.
   */
  [EngineEvent.FLAG_SET]: { flag: string; value: boolean | number | string }
  /** Emitted by `EventActionSystem` for a `play-sfx` action. */
  [EngineEvent.PLAY_SFX_REQUESTED]: { sound: string }
  /**
   * High-level "click without drag" emitted by `PointerGestureSystem`
   * on pointer-up when the press never crossed the drag threshold.
   * Consumers (e.g. `TileEditorSystem`'s paint trigger) should NOT
   * listen to raw `pointer.on('down')` — that fires before drag
   * intent is known and would paint on every camera-pan attempt.
   *
   * `screenPos` is the original press position (not the release
   * position) so the tap lands where the user pressed, even if a
   * sub-threshold finger wobble shifted the release slightly.
   */
  [EngineEvent.POINTER_TAP]: { screenPos: { x: number; y: number } }
  /**
   * Drag intent confirmed — the pointer crossed the drag threshold
   * after a press. `screenPos` is the ORIGINAL press position (the
   * anchor), not where the threshold was crossed, so pan/select
   * gestures can compute their delta from a stable origin.
   */
  [EngineEvent.POINTER_DRAG_START]: { screenPos: { x: number; y: number } }
  /**
   * Subsequent pointer-move while a drag is in progress. `deltaX` /
   * `deltaY` are the screen-space delta since the previous
   * `pointer-drag-{start,move}` event (NOT the cumulative delta from
   * the anchor) — matches how `CameraControlSystem` already chains
   * incremental pans. `screenPos` is the current pointer position.
   */
  [EngineEvent.POINTER_DRAG_MOVE]: {
    screenPos: { x: number; y: number }
    deltaX: number
    deltaY: number
  }
  /**
   * Drag finished or was cancelled (pointer-up, pointer-cancel,
   * focus-loss). Consumers should treat both the same — clean up
   * drag state, no further deltas will arrive.
   */
  [EngineEvent.POINTER_DRAG_END]: { screenPos: { x: number; y: number } }
  /**
   * Fired by `Engine.executeCommand` after a local command applies
   * + lands on the undo stack, AND by `Engine.redo` after the local
   * apply + cursor advance. The {@link SessionController} listens
   * here to relay the command as an `Operation` over the active
   * peer session (direction `'apply'`). **Not** fired for remote
   * commands applied via `Engine.applyRemoteCommand` — that would
   * create a feedback loop.
   *
   * `origin` is the initiating actor when it isn't the local human
   * user — e.g. `ASSISTANT_PEER_ID` for AI-collaborator edits driven
   * via Control/MCP. The SessionController copies it onto the
   * outgoing `Operation.origin` so remote peers can attribute the
   * edit to the AI instead of the hosting user. Absent = the local
   * user initiated the command.
   */
  [EngineEvent.COMMAND_EXECUTED]: { command: Command; origin?: string }
  /**
   * Fired by `Engine.undo` after the local command reverts + cursor
   * decrement. The {@link SessionController} relays the command as
   * an `Operation` with `direction: 'revert'` so the receiving peer
   * runs `command.revert` (mirroring the originator's undo).
   * **Not** fired for remote reverts applied via
   * `Engine.revertRemoteCommand`.
   *
   * `origin` mirrors `COMMAND_EXECUTED`'s — the initiating actor
   * when it isn't the local user.
   */
  [EngineEvent.COMMAND_REVERTED]: { command: Command; origin?: string }
  /**
   * Fired by `Engine.applyRemoteCommand` / `Engine.applyRemoteRevert`
   * after a REMOTE peer's operation mutated the local scene — the
   * receive-side counterpart of `COMMAND_EXECUTED` (which is local-
   * only to avoid relay loops). `origin` is the remote op's
   * attribution field: `ASSISTANT_PEER_ID` when the sending peer's
   * AI collaborator initiated the edit, absent for that peer's own
   * human edits. This is the hook UI attribution (e.g. an "AI
   * painted here" flash/badge for remote AI edits) subscribes to —
   * see TODO.md.
   */
  [EngineEvent.REMOTE_COMMAND_APPLIED]: {
    command: Command
    direction: 'apply' | 'revert'
    origin?: string
  }
  /**
   * A layer's `visible` / `locked` flag changed on the active map —
   * UI-sync event for the host's Layers tab. Fired by the Engine on
   * EVERY application path of a `SetLayerVisibilityCommand` /
   * `SetLayerLockedCommand`: local execute, undo, redo, AND remote
   * apply/revert (unlike `COMMAND_EXECUTED`, which deliberately
   * skips remote ops). `value` is the flag's effective value AFTER
   * the change. Carries the stable `LayerData.id`.
   */
  [EngineEvent.LAYER_FLAG_CHANGED]: {
    layerId: string
    flag: 'visible' | 'locked'
    value: boolean
  }
  /**
   * The active map's layer LIST changed — a layer was added, moved
   * inside its plane or moved to another plane — so the host's Layers
   * tab has to re-read `mapData.layers`. Same contract as
   * `LAYER_FLAG_CHANGED`: fired on EVERY application path of
   * `AddLayerCommand` / `ReorderLayerCommand` / `SetLayerPlaneCommand`
   * (local execute, undo, redo, remote apply/revert). Carries the
   * stable id of the layer the command targeted; the list itself is
   * read back from the map, which is the single owner of the order.
   */
  [EngineEvent.LAYER_LIST_CHANGED]: { layerId: string }
}
