import { HostileComponent, type HostileBehaviour } from '../../components/index.ts'
import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/** Hostile — an entity that fights the player. */
export interface HostileData extends ComponentData {
  type: 'hostile'
  behaviour?: HostileBehaviour
  aggroTiles?: number
  contactDamage?: number
  attackEveryMs?: number
  dropItemId?: string
  dropChance?: number
  respawn?: boolean
  expReward?: number
}

const DEFAULTS = {
  behaviour: 'chase',
  aggroTiles: 4,
  contactDamage: 1,
  attackEveryMs: 1000,
  dropChance: 0.5,
  respawn: true,
  expReward: 1,
} as const

const BEHAVIOURS: readonly HostileBehaviour[] = ['stationary', 'patrol', 'chase']

/** Map authored hostile data onto its runtime component. */
export function buildHostileComponent(data: HostileData): HostileComponent {
  const behaviour = BEHAVIOURS.includes(data.behaviour as HostileBehaviour)
    ? (data.behaviour as HostileBehaviour)
    : DEFAULTS.behaviour
  return new HostileComponent(
    behaviour,
    Math.max(0, Math.floor(data.aggroTiles ?? DEFAULTS.aggroTiles)),
    Math.max(0, Math.floor(data.contactDamage ?? DEFAULTS.contactDamage)),
    Math.max(0, Math.floor(data.attackEveryMs ?? DEFAULTS.attackEveryMs)),
    Math.min(1, Math.max(0, data.dropChance ?? DEFAULTS.dropChance)),
    data.respawn ?? DEFAULTS.respawn,
    Math.max(0, Math.floor(data.expReward ?? DEFAULTS.expReward)),
    data.dropItemId || undefined,
  )
}

export const hostileSpec: ComponentSpec = {
  type: 'hostile',
  system: 'combat-action',
  editor: { label: 'Enemy', icon: 'face-angry-symbolic', markerColor: '#dd4444', basic: true },
  fields: [
    {
      key: 'behaviour',
      label: 'Behaviour',
      input: 'select',
      basic: true,
      default: DEFAULTS.behaviour,
      options: [
        { value: 'stationary', label: 'Stays put' },
        { value: 'patrol', label: 'Walks its route' },
        { value: 'chase', label: 'Chases the player' },
      ],
    },
    {
      key: 'aggroTiles',
      label: 'Notices within (tiles)',
      input: 'int',
      basic: true,
      default: DEFAULTS.aggroTiles,
      min: 0,
      max: 32,
    },
    {
      key: 'contactDamage',
      label: 'Touch damage',
      input: 'int',
      basic: true,
      default: DEFAULTS.contactDamage,
      min: 0,
      max: 99,
    },
    {
      key: 'attackEveryMs',
      label: 'Attack interval (ms)',
      input: 'int',
      default: DEFAULTS.attackEveryMs,
      min: 0,
      max: 10000,
      step: 100,
    },
    // A plain string, matching `item.itemId`. The `entity-ref` picker
    // filtered to `item-def` arrives with the inventory bag that gives
    // `item-def` entities somewhere to exist.
    { key: 'dropItemId', label: 'Drops item', input: 'text' },
    {
      key: 'dropChance',
      label: 'Drop chance',
      input: 'float',
      default: DEFAULTS.dropChance,
      min: 0,
      max: 1,
      step: 0.05,
    },
    { key: 'respawn', label: 'Comes back', input: 'bool', default: DEFAULTS.respawn },
    { key: 'expReward', label: 'Experience reward', input: 'int', default: DEFAULTS.expReward, min: 0, max: 999 },
  ],
  build: (data) => buildHostileComponent(data as HostileData),
}
