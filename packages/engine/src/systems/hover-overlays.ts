import type { Actor, EventEmitter, Scene } from 'excalibur'
import {
  ActiveLayerComponent,
  ActiveObjectComponent,
  ActiveTileComponent,
  ActiveToolComponent,
} from '../components/index.ts'
import { createEraserPreviewActor, refreshEraserPreview } from '../services/eraser-preview.ts'
import { createFillPreviewActor, refreshFillPreview } from '../services/fill-preview.ts'
import { createObjectPreviewActor, refreshObjectPreview } from '../services/object-preview.ts'
import { createPencilPreviewActor, type PencilPreviewHover, refreshPencilPreview } from '../services/pencil-preview.ts'
import { createSelectHoverBorderActor, refreshSelectHoverBorder } from '../services/select-hover-border.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'

/**
 * The "what would happen if I clicked here" overlays: the pencil
 * ghost, the object-brush ghost, the select-tool hover border, the
 * fill region and the eraser cell. The eyedropper has none — it
 * reads a tile and changes nothing, so there is nothing to preview.
 *
 * Each has its own visual logic in `services/`; what they share is
 * lifecycle — one actor per scene, one hover position feeding all of
 * them, and a refresh on every change that could alter what a click
 * does: session state (tool, armed tile / brush, target layer) and,
 * because the fill region and the eraser cell are derived from the
 * map itself, every map mutation too. Not just pointer motion, or the
 * user would have to wiggle the mouse to see the effect of picking a
 * new tool, or watch a stale fill region survive the very click that
 * repainted it.
 *
 * Owned by `TileEditorSystem`, which handles the clicks themselves.
 */
export class HoverOverlays {
  private scene: Scene | null = null
  private pencilActor: Actor | null = null
  private objectActor: Actor | null = null
  private selectBorderActor: Actor | null = null
  private fillActor: Actor | null = null
  private eraserActor: Actor | null = null
  private hover: PencilPreviewHover | null = null

  /**
   * Add the overlay actors to `scene` and subscribe to the session
   * state each one reacts to, plus the engine-bus events that change
   * the map. The session subscriptions are tied to the scene's
   * lifetime via `SessionState`'s per-scene WeakMap registry; the bus
   * subscriptions outlive a switched-away scene (like the system's own
   * `POINTER_TAP` handler) and are made harmless by {@link isLive}.
   */
  attach(scene: Scene, events: EventEmitter<EngineEventMap>): void {
    this.scene = scene

    this.pencilActor = createPencilPreviewActor()
    scene.add(this.pencilActor)
    this.objectActor = createObjectPreviewActor()
    scene.add(this.objectActor)
    this.selectBorderActor = createSelectHoverBorderActor()
    scene.add(this.selectBorderActor)
    this.fillActor = createFillPreviewActor()
    scene.add(this.fillActor)
    this.eraserActor = createEraserPreviewActor()
    scene.add(this.eraserActor)

    // The pencil ghost and the fill region follow tool, armed tile and
    // target layer; the object ghost follows tool, armed brush and
    // target layer; the eraser cell follows tool and target layer; the
    // select border only needs the tool, so switching to / from
    // `'select'` doesn't strand the previous tool's overlay until the
    // next pointer move.
    SessionState.subscribe(scene, ActiveToolComponent, () => this.refresh())
    SessionState.subscribe(scene, ActiveLayerComponent, () => {
      this.refreshPencil()
      this.refreshObject()
      this.refreshFill()
      this.refreshEraser()
    })
    SessionState.subscribe(scene, ActiveTileComponent, () => {
      this.refreshPencil()
      this.refreshFill()
    })
    SessionState.subscribe(scene, ActiveObjectComponent, () => this.refreshObject())

    // Map mutations from every path — a local click, undo / redo, a
    // remote peer's op, a layer lock or removal — can change the fill
    // region and the eraser cell without the pointer moving. The fill
    // preview validates its cache by the shadow's revision, so these
    // only need to trigger a refresh, not carry what changed.
    const onMapChanged = () => this.refresh()
    events.on(EngineEvent.COMMAND_EXECUTED, onMapChanged)
    events.on(EngineEvent.COMMAND_REVERTED, onMapChanged)
    events.on(EngineEvent.REMOTE_COMMAND_APPLIED, onMapChanged)
    events.on(EngineEvent.LAYER_FLAG_CHANGED, onMapChanged)
    events.on(EngineEvent.LAYER_LIST_CHANGED, onMapChanged)
  }

  /** Move the overlays to `hover`, or clear them with `null`. */
  setHover(hover: PencilPreviewHover | null): void {
    this.hover = hover
    this.refresh()
  }

  private refresh(): void {
    if (!this.isLive()) return
    this.refreshPencil()
    this.refreshObject()
    this.refreshSelectBorder()
    this.refreshFill()
    this.refreshEraser()
  }

  private refreshPencil(): void {
    if (!this.pencilActor || !this.scene) return
    refreshPencilPreview(this.pencilActor, this.scene, this.hover)
  }

  private refreshObject(): void {
    if (!this.objectActor || !this.scene) return
    refreshObjectPreview(this.objectActor, this.scene, this.hover)
  }

  private refreshSelectBorder(): void {
    if (!this.selectBorderActor || !this.scene) return
    refreshSelectHoverBorder(this.selectBorderActor, this.scene, this.hover)
  }

  private refreshFill(): void {
    if (!this.fillActor || !this.scene || !this.isLive()) return
    refreshFillPreview(this.fillActor, this.scene, this.hover)
  }

  private refreshEraser(): void {
    if (!this.eraserActor || !this.scene || !this.isLive()) return
    refreshEraserPreview(this.eraserActor, this.scene, this.hover)
  }

  /**
   * Whether this scene is the one on screen. `Engine.loadMap` keeps a
   * switched-away map's scene registered, and its systems stay
   * subscribed to the engine-level pointer and bus — refreshing a fill
   * preview there would flood-fill a hidden map's shadow on every
   * hover and every command. A scene with no engine (headless tests)
   * counts as live.
   */
  private isLive(): boolean {
    const scene = this.scene
    if (!scene) return false
    return scene.engine ? scene.engine.currentScene === scene : true
  }
}
