import { Component } from 'excalibur'

/**
 * Visual representation reference for an object entity — the
 * `spriteSetId` / `spriteId` / `animationId` triple the `visual`
 * component config carried, attached at spawn by `visualSpec.build`.
 *
 * Storing only the reference keeps the component data-only (no GPU
 * handles tied to the component lifetime).
 *
 * orphan-component-ok: KNOWN GAP — nothing reads this yet. The graphic a
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
  ) {
    super()
  }
}
