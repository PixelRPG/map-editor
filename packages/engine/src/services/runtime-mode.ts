import type { Scene } from 'excalibur'
import { EditorModeComponent, RuntimeModeComponent } from '../components/index.ts'
import { SessionState } from '../utils/session-state.ts'

/**
 * The editor ⇄ runtime mode markers on a scene's session-singleton.
 *
 * Exactly one of {@link EditorModeComponent} / {@link RuntimeModeComponent}
 * is attached at a time; systems branch on which one they find. Two
 * code paths flip them — the play/stop toggle and the mid-play teleport
 * that carries the play state onto a freshly built scene — so the swap
 * lives here rather than being written out twice (a half-swap leaves a
 * scene in both modes, and every system then disagrees about which one
 * it is in).
 */

/** Whether `scene` is in runtime (play) mode. */
export function isRuntimeModeActive(scene: Scene): boolean {
  return SessionState.get(scene, RuntimeModeComponent) !== null
}

/** Swap the mode markers on `scene` so exactly one of them is present. */
export function applyRuntimeMode(scene: Scene, active: boolean): void {
  if (active) {
    SessionState.unset(scene, EditorModeComponent)
    SessionState.set(scene, new RuntimeModeComponent())
    return
  }
  SessionState.unset(scene, RuntimeModeComponent)
  SessionState.set(scene, new EditorModeComponent())
}
