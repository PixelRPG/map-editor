import { Component } from 'excalibur'
import type { DepthMode } from '../services/depth-sort.ts'

/**
 * Visual representation reference for an object entity — the
 * `spriteSetId` / `spriteId` / `animationId` triple the `visual`
 * component config carried, attached at spawn by `visualSpec.build`.
 *
 * Storing only the reference keeps the component data-only (no GPU
 * handles tied to the component lifetime).
 *
 * Known gap: only `depth` is read (by `applyActorDepth`), sprite fields are not. The graphic a
 * placement renders is built from the DEFINITION, not from this
 * component: `spawn-placement.ts` calls `buildPlacementGraphic(def, …)`,
 * which finds the `visual` entry in `def.components` itself. So a
 * runtime sprite swap (writing this component and expecting the actor to
 * follow) currently does nothing. Closing the gap means routing the
 * graphic build through the component; tracked in TODO.md, "Engine /
 * runtime".
 */
export class SpriteRefComponent extends Component {
  constructor(
    public spriteSetId: string,
    public spriteId: number,
    public animationId?: string,
    /** Where the thing is drawn in the hero band; read by `applyActorDepth`. */
    public depth: DepthMode = 'sorted',
  ) {
    super()
  }
}
