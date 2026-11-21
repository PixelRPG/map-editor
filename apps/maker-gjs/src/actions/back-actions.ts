import Gio from '@girs/gio-2.0'
import { type BackState, type BackStep, resolveBackStep } from '../services/back-order.ts'
import { addAction } from './action-registry.ts'

/**
 * What one back needs from the window: the state to decide on, and one
 * performer per step. Reading and doing are split so the decision stays
 * in `back-order.ts`, where a spec can reach it.
 */
export interface BackActionsContext {
  /** Everything {@link resolveBackStep} reads, sampled at gesture time. */
  backState(): BackState
  /** Step 1 — leave the Live Run (`win.play` off). */
  stopRun(): void
  /** Step 2 — collapse the editor's phone sheet to its peek bar. */
  collapseSheet(): void
  /** Step 3 — drop the map selection. */
  clearSelection(): void
  /** Step 4 — pop the visible destination's pushed detail page. */
  popPage(): void
  /** Step 5 — back to World, centred on the map just left. */
  leaveMap(): void
  /** Dismiss World's map sidebar overlay (phone). */
  closeSidebar(): void
}

/**
 * `win.back` — the one back. Every gesture § 3.4 lists routes here: the
 * header and OSD back buttons, `Esc`, `Alt+←`, the mouse back button and
 * the shell's back gesture, so they can only ever undo the same thing.
 *
 * `win.back-to-atlas` stays as it is: it is the *unconditional* "leave
 * the map" that the editor's own back buttons, the MCP bridge's
 * `back_to_atlas` tool and `scripts/smoke/drive.py` bind.
 *
 * The returned `performBack` is for the gesture handlers the window owns
 * (the shortcut controller, the mouse button): they must know whether a
 * back happened to decide whether the event travels on, and a
 * `Gio.Action` activation cannot report that.
 */
export function installBackActions(
  group: Gio.SimpleActionGroup,
  ctx: BackActionsContext,
): { back: Gio.SimpleAction; performBack: () => BackStep } {
  const performBack = (): BackStep => {
    const step = resolveBackStep(ctx.backState())
    switch (step) {
      case 'stop-run':
        ctx.stopRun()
        break
      case 'close-sidebar':
        ctx.closeSidebar()
        break
      case 'collapse-sheet':
        ctx.collapseSheet()
        break
      case 'clear-selection':
        ctx.clearSelection()
        break
      case 'pop-page':
        ctx.popPage()
        break
      case 'leave-map':
        ctx.leaveMap()
        break
      case 'none':
        break
    }
    return step
  }

  const back = new Gio.SimpleAction({ name: 'back' })
  back.connect('activate', () => void performBack())
  addAction(group, back)

  return { back, performBack }
}
