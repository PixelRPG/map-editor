import { Color, type EventEmitter, type Engine as ExcaliburEngine } from 'excalibur'
import { type EditorViewFlags, EditorViewModeComponent } from '../components/index.ts'
import {
  DEFAULT_EDITOR_VIEW_FLAGS,
  editorViewFlagsEqual,
  mergeEditorViewFlags,
  readEditorViewFlags,
} from '../services/editor-view-flags.ts'
import { applyEditorViewMode } from '../services/editor-view.ts'
import type { EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { type ActiveSceneAccessor, rebindOnMapLoaded } from './scene-binding.ts'

/**
 * The editor's render-only view flags — grid lines, inactive-layer
 * dimming, global object visibility — and the two surfaces they drive:
 * the scene's render passes and Excalibur's engine-scoped debug config.
 *
 * The flags are independent of one another and never persisted to map
 * data. Splitting them off the engine keeps the "write the component,
 * reconfigure debug, re-run the render passes" sequence in one place;
 * the individual public setters differ only in which field they carry.
 */
export class ViewModeController {
  constructor(
    private readonly excalibur: ExcaliburEngine,
    private readonly activeScene: ActiveSceneAccessor,
    private readonly events: EventEmitter<EngineEventMap>,
  ) {}

  /** Current flags on the active scene, or the defaults without one. */
  getFlags(): EditorViewFlags {
    const scene = this.activeScene()
    if (!scene) return { ...DEFAULT_EDITOR_VIEW_FLAGS }
    return readEditorViewFlags(SessionState.get(scene, EditorViewModeComponent))
  }

  /** Merge `partial` over the current flags and re-apply every surface. */
  update(partial: Partial<EditorViewFlags>): void {
    const scene = this.activeScene()
    if (!scene) return
    const current = SessionState.get(scene, EditorViewModeComponent)
    const next = mergeEditorViewFlags(current, partial)
    if (editorViewFlagsEqual(current, next)) return
    SessionState.set(scene, new EditorViewModeComponent(next.showGrid, next.dimInactiveLayers, next.objectsVisible))
    this.configureGridDebug(next.showGrid)
    applyEditorViewMode(scene)
  }

  /**
   * Subscribe to flag changes. Fires once synchronously with the
   * current snapshot (the defaults when no scene is active), then on
   * every mutation. Rebinds across map switches.
   */
  onChanged(cb: (flags: EditorViewFlags) => void): () => void {
    return rebindOnMapLoaded(this.events, () => {
      const scene = this.activeScene()
      if (!scene) {
        cb({ ...DEFAULT_EDITOR_VIEW_FLAGS })
        return null
      }
      return SessionState.subscribe(scene, EditorViewModeComponent, (component) => cb(readEditorViewFlags(component)))
    })
  }

  /**
   * Tweak Excalibur's debug-render config + flip the global debug flag
   * depending on whether the editor wants the grid drawn.
   *
   * Every debug visualisation that isn't the tilemap grid is disabled,
   * so the editor surface stays clean — no collider boxes, no camera
   * viewport rectangles. Written as one block rather than scattered
   * field touches so toggling is a predictable reset instead of a
   * sticky accumulation of flags from earlier toggles.
   */
  private configureGridDebug(showGrid: boolean): void {
    if (!showGrid) {
      this.excalibur.showDebug(false)
      return
    }
    const debug = this.excalibur.debug
    debug.tilemap.showAll = false
    debug.tilemap.showGrid = true
    debug.tilemap.gridColor = Color.fromHex('#ffffff66')
    debug.tilemap.gridWidth = 1
    debug.tilemap.showSolidBounds = false
    debug.tilemap.showColliderGeometry = false
    // Other categories: hard off — we only want the tilemap grid.
    debug.entity.showAll = false
    debug.collider.showAll = false
    debug.body.showAll = false
    debug.camera.showAll = false
    this.excalibur.showDebug(true)
  }
}
