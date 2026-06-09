import { CollisionComponent } from '../../components/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/**
 * Collision — blocking. The shipped model had a `blocking?: boolean`
 * field; in the component model the **presence** of this component is the
 * blocking flag (no data). Add it to make an entity solid, remove it to
 * let the player walk through.
 */
export const collisionSpec: ComponentSpec = {
  type: 'collision',
  editor: { label: 'Blocks movement', icon: 'security-high-symbolic', basic: true },
  fields: [],
  build: () => new CollisionComponent(),
}
