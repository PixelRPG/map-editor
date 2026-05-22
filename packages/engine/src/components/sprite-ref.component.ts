import { Component } from 'excalibur'

/**
 * Visual representation reference for an object entity.
 *
 * The actual `ex.Sprite` / `ex.Animation` lookup happens at render
 * time via the scene's loaded sprite-set resources. Storing only the
 * reference keeps the component data-only (no GPU handles tied to
 * the component lifetime).
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
