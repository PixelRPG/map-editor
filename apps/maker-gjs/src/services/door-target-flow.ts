import type { ArrivalPickRequest, EntityDefinition } from '@pixelrpg/engine'
import { type DoorTeleport, type MapBounds, planDoorBack, type Tile, withDoorTargetComponents } from '@pixelrpg/gjs'
import type { DoorTargetChoice } from '../widgets/scene-editor/door-target-dialog.ts'

/**
 * What the flow needs to know about the door it is re-pointing. Read off
 * the LIVE map data, once, when the flow starts — the trip through the
 * target map ends with a reload of this map, so anything read later
 * would come from a different `MapData` object.
 */
export interface DoorInfo {
  /** The door's own tile on the source map. */
  tile: Tile
  /** Its resolved definition (library entry + this placement's overrides). */
  definition: EntityDefinition
  /** Its teleport component — what makes it a door at all. */
  teleport: DoorTeleport
}

/**
 * The window-owned pieces of the REDESIGN § 6.2 "Goes to" flow. Every
 * user-facing sentence is a `report*` callback rather than a
 * `showToast(_('…'))` call in here, for the reason
 * `SceneNavigatorContext` documents: a service that imports `gettext`
 * cannot be reached from a spec.
 */
export interface DoorTargetFlowContext {
  /** The door behind `placementId`, or `null` when it is not a door. */
  readDoor(placementId: string): DoorInfo | null
  /** Which map the scene editor is on. */
  currentMapId(): string | null
  /** A map's tile dimensions — needed to keep the door back on the map. */
  mapBounds(mapId: string): MapBounds | null
  /** Present the map picker; the callback fires only if a map was chosen. */
  askForMap(currentTargetMapId: string | null, onChoose: (choice: DoorTargetChoice) => void): void
  /** Open a map in the scene editor, calling back once it is hydrated. */
  openMap(mapId: string, onReady: () => void): void
  /** Arm (or, with `null`, disarm) the active map's arrival pick. */
  armPick(request: ArrivalPickRequest | null): void
  /** Strip the editor chrome down to the pick banner, or put it back. */
  setPicking(picking: boolean): void
  /** Stamp a placement carrying its own definition on the active map. */
  placeInline(definition: EntityDefinition, tile: Tile): boolean
  /** Write the door's teleport on the active map. */
  pointDoor(placementId: string, targetMapId: string, tile: Tile): boolean
  /** The person tapped Cancel in the pick banner. */
  reportCancelled(): void
  /** The door now leads to `targetMapId`. */
  reportTargetSet(targetMapId: string): void
  /** The door back could not be placed, but the door itself is set. */
  reportDoorBackFailed(): void
  /** The teleport write was refused — the door is unchanged. */
  reportFailed(): void
}

/** The question in flight, from the picker's answer to the tap. */
interface PendingPick {
  readonly sourceMapId: string
  readonly doorPlacementId: string
  readonly targetMapId: string
  readonly addDoorBack: boolean
  readonly door: DoorInfo
}

/**
 * REDESIGN § 6.2 step by step: ask which map a door leads to, open that
 * map with every other affordance taken away, take one tap as the
 * arrival tile, optionally leave a door back on it, then come home and
 * write the door's teleport.
 *
 * ### Why this is two commands and not one
 *
 * § 8 (L1018) asks for "two commands in one undo group". That is not
 * buildable today and this flow does not pretend otherwise: the undo
 * stack is `UndoStackComponent` on the active scene, one per map, and
 * these two edits land on two different maps. Grouping them would mean
 * a cross-map history, which is a change to the command model rather
 * than to this feature. So the order is chosen to make each half
 * independently sensible instead: the door back goes down while the
 * target map is still active (one undo entry there), the teleport write
 * happens after the trip home (one undo entry here), and a person who
 * undoes once gets the half they are looking at.
 */
export class DoorTargetFlow {
  private _pending: PendingPick | null = null

  constructor(private readonly ctx: DoorTargetFlowContext) {}

  /** Whether a map is currently waiting for its arrival tap. */
  get picking(): boolean {
    return this._pending !== null
  }

  /**
   * `win.door-target` / the Selected page's "Goes to" row: ask which map
   * this door leads to.
   *
   * Silent when the selection is not a door — the context menu hides the
   * entry in that case, but the action stays registered for the keyboard
   * and the Control plane, so it has to tolerate being fired at a rock.
   */
  start(placementId: string): void {
    const sourceMapId = this.ctx.currentMapId()
    if (!sourceMapId) return
    const door = this.ctx.readDoor(placementId)
    if (!door) return
    this.ctx.askForMap(door.teleport.targetMapId ?? null, (choice) => {
      this._beginPick({
        sourceMapId,
        doorPlacementId: placementId,
        targetMapId: choice.targetMapId,
        addDoorBack: choice.addDoorBack,
        door,
      })
    })
  }

  /**
   * Open the chosen map and arm the tap.
   *
   * A door to its own map (a staircase between two floors authored as
   * one map) skips the navigation: re-opening the map that is already
   * open would tear the engine down and build it back up for nothing,
   * and the selection the flow still needs lives on that scene.
   */
  private _beginPick(pending: PendingPick): void {
    this._pending = pending
    const arm = (): void => {
      // Guard against a second flow having started in the meantime: the
      // navigation is async and `start` is one tap away at any time.
      if (this._pending !== pending) return
      this.ctx.armPick({ sourceMapId: pending.sourceMapId, doorPlacementId: pending.doorPlacementId })
      this.ctx.setPicking(true)
    }
    if (pending.targetMapId === pending.sourceMapId) arm()
    else this.ctx.openMap(pending.targetMapId, arm)
  }

  /**
   * The pick banner's Cancel: give the person back the map they came
   * from. Leaving them on the target map would be a navigation they
   * never asked for — they went there to answer a question and then
   * withdrew it.
   */
  cancel(): void {
    const pending = this._pending
    if (!pending) return
    this._disarm()
    this.ctx.reportCancelled()
    if (pending.targetMapId !== pending.sourceMapId) {
      this.ctx.openMap(pending.sourceMapId, () => {})
    }
  }

  /**
   * Drop the flow without navigating or saying anything — for leaving
   * the map editor altogether while a pick is armed. The engine's half
   * of the arming dies with the scene, but the chrome's does not, so a
   * re-entry would otherwise come up showing the pick banner.
   */
  abandon(): void {
    if (!this._pending) return
    this._disarm()
  }

  private _disarm(): void {
    this._pending = null
    this.ctx.armPick(null)
    this.ctx.setPicking(false)
  }

  /**
   * A tap on the target map answered the question (the engine's
   * `ARRIVAL_PICK_REQUESTED`). Place the door back while that map is
   * still the active one, then go home and point the door.
   */
  arrivalPicked(request: ArrivalPickRequest & { targetMapId: string; coords: { x: number; y: number } }): void {
    const pending = this._pending
    if (!pending) return
    // The arming carries the door it was armed for, so a stale event
    // from an earlier flow cannot write onto the current one.
    if (request.doorPlacementId !== pending.doorPlacementId) return
    if (request.sourceMapId !== pending.sourceMapId) return
    if (request.targetMapId !== pending.targetMapId) return

    const arrival: Tile = { x: request.coords.x, y: request.coords.y }
    this._disarm()

    const doorBackPlaced = pending.addDoorBack ? this._placeDoorBack(pending, arrival) : true

    const finish = (): void => {
      if (this.ctx.pointDoor(pending.doorPlacementId, pending.targetMapId, arrival)) {
        this.ctx.reportTargetSet(pending.targetMapId)
        if (!doorBackPlaced) this.ctx.reportDoorBackFailed()
      } else {
        this.ctx.reportFailed()
      }
    }
    if (pending.targetMapId === pending.sourceMapId) finish()
    else this.ctx.openMap(pending.sourceMapId, finish)
  }

  /**
   * Leave a return door on the target map, built from the door the
   * person is editing: same sprite, same collider, same trigger, only
   * the destination rewritten. That is what makes it look like a door —
   * a bare teleport component draws nothing.
   *
   * It is placed INLINE rather than as a library reference because the
   * source door itself usually is one (every door in the sample project
   * carries its own definition and the entity library holds no door
   * entry), and copying a resolved definition is the only way to match
   * a door that exists nowhere else.
   *
   * The `label` is deliberately dropped: it named the FORWARD door's
   * destination, and carrying it over would label the way back with the
   * name of the room it leads out of.
   *
   * No `layerId`, i.e. the active layer — the same one a hand-placed
   * Thing lands on. A padlocked active layer therefore refuses the
   * placement, which is reported rather than worked around: silently
   * writing to another layer would put the door somewhere the person
   * cannot see it.
   */
  private _placeDoorBack(pending: PendingPick, arrival: Tile): boolean {
    const sourceBounds = this.ctx.mapBounds(pending.sourceMapId)
    const arrivalBounds = this.ctx.mapBounds(pending.targetMapId)
    if (!sourceBounds || !arrivalBounds) return false

    const plan = planDoorBack({
      sourceTile: pending.door.tile,
      sourceBounds,
      arrivalTile: arrival,
      arrivalBounds,
      facing: pending.door.teleport.facing,
    })
    const definition: EntityDefinition = {
      ...pending.door.definition,
      components: withDoorTargetComponents(pending.door.definition.components, {
        type: 'teleport',
        targetMapId: pending.sourceMapId,
        targetTileX: plan.targetTile.x,
        targetTileY: plan.targetTile.y,
        facing: plan.facing,
      }),
    }
    return this.ctx.placeInline(definition, plan.placeAt)
  }
}
