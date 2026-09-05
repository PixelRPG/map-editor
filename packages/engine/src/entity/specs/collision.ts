import { CollisionComponent } from '../../components/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/**
 * Collision — blocking. The shipped model had a `blocking?: boolean`
 * field; in the component model the **presence** of this component is the
 * blocking flag (no data).
 *
 * It does not block anything yet. No movement system reads
 * {@link CollisionComponent}, so adding the component — and the
 * *"Blocks movement"* toggle below that offers it — has no runtime
 * effect: the player walks through every chest, sign and door the entity
 * templates seed. See the component's own `orphan-component-ok:` note and
 * TODO.md, "Engine / runtime".
 */
export const collisionSpec: ComponentSpec = {
  type: 'collision',
  editor: { label: 'Blocks movement', icon: 'security-high-symbolic', basic: true },
  fields: [],
  build: () => new CollisionComponent(),
}
