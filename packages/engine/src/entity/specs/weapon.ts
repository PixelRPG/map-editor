import { WeaponComponent } from '../../components/index.ts'
import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/** Weapon — what the entity swings, and how far. */
export interface WeaponData extends ComponentData {
  type: 'weapon'
  damage?: number
  reachTiles?: number
  swingMs?: number
  knockbackTiles?: number
  animation?: string
  sound?: string
}

const DEFAULTS = { damage: 1, reachTiles: 1, swingMs: 250, knockbackTiles: 0.5 } as const

/** Map authored weapon data onto its runtime component. */
export function buildWeaponComponent(data: WeaponData): WeaponComponent {
  return new WeaponComponent(
    Math.max(0, Math.floor(data.damage ?? DEFAULTS.damage)),
    Math.min(3, Math.max(1, Math.floor(data.reachTiles ?? DEFAULTS.reachTiles))),
    Math.max(0, Math.floor(data.swingMs ?? DEFAULTS.swingMs)),
    Math.min(2, Math.max(0, data.knockbackTiles ?? DEFAULTS.knockbackTiles)),
    data.animation,
    data.sound,
  )
}

export const weaponSpec: ComponentSpec = {
  type: 'weapon',
  system: 'combat-action',
  editor: { label: 'Weapon', icon: 'edit-cut-symbolic', markerColor: '#ff9955', basic: true },
  fields: [
    { key: 'damage', label: 'Damage', input: 'int', basic: true, default: DEFAULTS.damage, min: 0, max: 99 },
    {
      key: 'reachTiles',
      label: 'Reach (tiles)',
      input: 'int',
      basic: true,
      default: DEFAULTS.reachTiles,
      min: 1,
      max: 3,
    },
    { key: 'swingMs', label: 'Swing time (ms)', input: 'int', default: DEFAULTS.swingMs, min: 0, max: 5000, step: 50 },
    {
      key: 'knockbackTiles',
      label: 'Knockback (tiles)',
      input: 'float',
      default: DEFAULTS.knockbackTiles,
      min: 0,
      max: 2,
      step: 0.1,
    },
    { key: 'animation', label: 'Swing animation', input: 'text' },
    { key: 'sound', label: 'Swing sound', input: 'text' },
  ],
  build: (data) => buildWeaponComponent(data as WeaponData),
}
