import { Component } from 'excalibur'
import type { DragIntent } from '../services/drag-router.ts'

/**
 * What the drag currently in progress is doing — written by
 * `TileEditorSystem` when `POINTER_DRAG_START` arrives (it is the
 * system that knows the armed tool and the target layer), read by
 * `CameraControlSystem` on every `POINTER_DRAG_MOVE`.
 *
 * On the session singleton rather than in either system's fields,
 * because it is exactly the state two systems share. Both resolve it
 * through the same pure {@link resolveDragIntent}; this component is
 * only the channel that carries one system's answer to the other
 * within a single gesture.
 *
 * Order is safe: `PointerGestureSystem` emits `POINTER_DRAG_START` and
 * `POINTER_DRAG_MOVE` from the same `move` handler, START first, and
 * the event emitter runs its listeners synchronously — so the intent
 * is always written before the first move is read.
 *
 * `'pan'` is the default, so a scene without a `TileEditorSystem`
 * (a game run, a preview) keeps the camera drag it has always had.
 */
export class DragIntentComponent extends Component {
  constructor(public intent: DragIntent = 'pan') {
    super()
  }
}
