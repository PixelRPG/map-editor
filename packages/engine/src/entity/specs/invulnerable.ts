import { InvulnerableComponent } from '../../components/index.ts'
import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/** Invulnerable — the grace period after taking a hit. */
export interface InvulnerableData extends ComponentData {
  type: 'invulnerable'
  afterHitMs?: number
}

const DEFAULT_AFTER_HIT_MS = 800

/** Map authored invulnerability data onto its runtime component. */
export function buildInvulnerableComponent(data: InvulnerableData): InvulnerableComponent {
  return new InvulnerableComponent(Math.max(0, Math.floor(data.afterHitMs ?? DEFAULT_AFTER_HIT_MS)))
}

export const invulnerableSpec: ComponentSpec = {
  type: 'invulnerable',
  system: 'combat-action',
  editor: { label: 'Grace period', icon: 'security-medium-symbolic', basic: true },
  fields: [
    {
      key: 'afterHitMs',
      label: 'Untouchable after a hit (ms)',
      input: 'int',
      basic: true,
      default: DEFAULT_AFTER_HIT_MS,
      min: 0,
      max: 5000,
      step: 100,
    },
  ],
  build: (data) => buildInvulnerableComponent(data as InvulnerableData),
}
