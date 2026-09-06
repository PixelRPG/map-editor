import { HurtboxComponent } from '../../components/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/**
 * Hurtbox — can be hit.
 *
 * No fields: the **presence** of the component is the whole datum, the
 * same shape `collision` uses for "blocks movement". It is what separates
 * a slime from a signpost when a sword sweeps across both.
 */
export const hurtboxSpec: ComponentSpec = {
  type: 'hurtbox',
  system: 'combat-action',
  editor: { label: 'Can be hit', icon: 'dialog-warning-symbolic', basic: true },
  fields: [],
  build: () => new HurtboxComponent(),
}
