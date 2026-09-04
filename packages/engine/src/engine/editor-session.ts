import type { EventEmitter } from 'excalibur'
import {
  ActiveLayerComponent,
  ActiveObjectComponent,
  ActiveTileComponent,
  ActiveToolComponent,
  type EditorTool,
  EditorViewModeComponent,
  SelectedPlacementsComponent,
} from '../components/index.ts'
import { applyEditorViewMode } from '../services/editor-view.ts'
import type { EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { type ActiveSceneAccessor, rebindOnMapLoaded } from './scene-binding.ts'

/**
 * The editor's per-scene "what am I about to do" state: active tool,
 * armed tile, armed object brush, target layer and current selection.
 *
 * All five live on the active scene's session-singleton so systems read
 * them through `SessionState` rather than reaching back into the engine
 * — this class is only the typed accessor pair around that, plus the
 * one side effect the raw component write cannot express (re-applying
 * the dimming when the active layer moves).
 *
 * Every write no-ops without an active `MapScene`; every read reports
 * the empty answer. Callers are UI handlers that can fire before the
 * first map is open.
 */
export class EditorSession {
  constructor(
    private readonly activeScene: ActiveSceneAccessor,
    private readonly events: EventEmitter<EngineEventMap>,
  ) {}

  get activeTool(): EditorTool | null {
    const scene = this.activeScene()
    if (!scene) return null
    return SessionState.get(scene, ActiveToolComponent)?.tool ?? null
  }

  set activeTool(tool: EditorTool) {
    const scene = this.activeScene()
    if (!scene) return
    SessionState.set(scene, new ActiveToolComponent(tool))
  }

  /** Global tile sprite id (sprite-set `firstGid` + local index). */
  get activeTile(): number | null {
    const scene = this.activeScene()
    if (!scene) return null
    return SessionState.get(scene, ActiveTileComponent)?.spriteId ?? null
  }

  set activeTile(spriteId: number) {
    const scene = this.activeScene()
    if (!scene) return
    SessionState.set(scene, new ActiveTileComponent(spriteId))
  }

  /** Entity-library definition id the `'object'` tool stamps, or `null`. */
  get objectBrush(): string | null {
    const scene = this.activeScene()
    if (!scene) return null
    return SessionState.get(scene, ActiveObjectComponent)?.defId ?? null
  }

  set objectBrush(defId: string | null) {
    const scene = this.activeScene()
    if (!scene) return
    SessionState.set(scene, new ActiveObjectComponent(defId))
  }

  /** Matches a `LayerData.id` on the active map. */
  get activeLayer(): string | null {
    const scene = this.activeScene()
    if (!scene) return null
    return SessionState.get(scene, ActiveLayerComponent)?.layerId ?? null
  }

  set activeLayer(layerId: string) {
    const scene = this.activeScene()
    if (!scene) return
    SessionState.set(scene, new ActiveLayerComponent(layerId))
    // Switching the active layer changes which layer keeps full
    // opacity, so the dimming has to be re-applied. No-op while the
    // flag is off (the helper's opacity provider returns 1.0 then).
    if (SessionState.get(scene, EditorViewModeComponent)?.dimInactiveLayers) {
      applyEditorViewMode(scene)
    }
  }

  /** Current placement selection; empty array when nothing is selected. */
  get selectedPlacements(): string[] {
    const scene = this.activeScene()
    if (!scene) return []
    return SessionState.get(scene, SelectedPlacementsComponent)?.placementIds ?? []
  }

  /**
   * An empty array clears the selection by dropping the component, so
   * "absent" and "empty" stay one state that {@link selectedPlacements}
   * collapses to `[]`.
   */
  set selectedPlacements(placementIds: readonly string[]) {
    const scene = this.activeScene()
    if (!scene) return
    if (placementIds.length === 0) {
      SessionState.unset(scene, SelectedPlacementsComponent)
      return
    }
    SessionState.set(scene, new SelectedPlacementsComponent([...placementIds]))
  }

  /**
   * Subscribe to the selection set. Fires with the current selection
   * immediately and on every change; rebinds across map switches.
   */
  onSelectionChanged(cb: (placementIds: string[]) => void): () => void {
    return rebindOnMapLoaded(this.events, () => {
      const scene = this.activeScene()
      if (!scene) return null
      return SessionState.subscribe(scene, SelectedPlacementsComponent, () => cb(this.selectedPlacements))
    })
  }
}
