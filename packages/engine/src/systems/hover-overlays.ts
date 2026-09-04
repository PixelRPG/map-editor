import type { Actor, Scene } from 'excalibur'
import {
  ActiveLayerComponent,
  ActiveObjectComponent,
  ActiveTileComponent,
  ActiveToolComponent,
} from '../components/index.ts'
import { createObjectPreviewActor, refreshObjectPreview } from '../services/object-preview.ts'
import { createPencilPreviewActor, type PencilPreviewHover, refreshPencilPreview } from '../services/pencil-preview.ts'
import { createSelectHoverBorderActor, refreshSelectHoverBorder } from '../services/select-hover-border.ts'
import { SessionState } from '../utils/session-state.ts'

/**
 * The three "what would happen if I clicked here" overlays: the pencil
 * ghost, the object-brush ghost, and the select-tool hover border.
 *
 * Each has its own visual logic in `services/`; what they share is
 * lifecycle — one actor per scene, one hover position feeding all
 * three, and a refresh on every session-state change that could alter
 * what a click does (not just on pointer motion, or the user would
 * have to wiggle the mouse to see the effect of picking a new tool or
 * swatch).
 *
 * Owned by `TileEditorSystem`, which handles the clicks themselves.
 */
export class HoverOverlays {
  private scene: Scene | null = null
  private pencilActor: Actor | null = null
  private objectActor: Actor | null = null
  private selectBorderActor: Actor | null = null
  private hover: PencilPreviewHover | null = null

  /**
   * Add the overlay actors to `scene` and subscribe to the session
   * state each one reacts to. Subscriptions are tied to the scene's
   * lifetime via `SessionState`'s per-scene WeakMap registry, so no
   * explicit teardown is needed.
   */
  attach(scene: Scene): void {
    this.scene = scene

    this.pencilActor = createPencilPreviewActor()
    scene.add(this.pencilActor)
    this.objectActor = createObjectPreviewActor()
    scene.add(this.objectActor)
    this.selectBorderActor = createSelectHoverBorderActor()
    scene.add(this.selectBorderActor)

    // The pencil ghost follows tool, armed tile and target layer; the
    // object ghost follows tool, armed brush and target layer; the
    // select border only needs the tool, so switching to / from
    // `'select'` doesn't strand the previous tool's overlay until the
    // next pointer move.
    SessionState.subscribe(scene, ActiveToolComponent, () => this.refresh())
    SessionState.subscribe(scene, ActiveLayerComponent, () => {
      this.refreshPencil()
      this.refreshObject()
    })
    SessionState.subscribe(scene, ActiveTileComponent, () => this.refreshPencil())
    SessionState.subscribe(scene, ActiveObjectComponent, () => this.refreshObject())
  }

  /** Move the overlays to `hover`, or clear them with `null`. */
  setHover(hover: PencilPreviewHover | null): void {
    this.hover = hover
    this.refresh()
  }

  private refresh(): void {
    this.refreshPencil()
    this.refreshObject()
    this.refreshSelectBorder()
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
}
