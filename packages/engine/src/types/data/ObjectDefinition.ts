/**
 * Library entry — a reusable "what is this kind of thing" template
 * that any number of {@link ObjectPlacement}s can reference.
 *
 * Object definitions live at the project level
 * (`GameProjectData.objectLibrary`) so a single edit propagates to
 * every placement that references the entry. Per-placement
 * `overrides` patch on top for one-off tweaks.
 *
 * See `docs/concepts/object-system.md` for the full design — kinds,
 * blocking defaults, the canonical pattern table, and the ECS
 * spawn flow.
 */
export interface ObjectDefinition {
  /** Stable, project-unique id used by placements via `defId`. */
  id: string

  /**
   * Semantic "what is this object" — drives library categorisation,
   * inspector layout, default trigger mode, and the editor's
   * default `blocking` suggestion. NOT a component-composition
   * switch (`blocking` is orthogonal). Add a new kind only when the
   * editor genuinely deserves a dedicated UX surface; everything
   * else starts life as `'event'` and graduates only if it proves
   * out.
   */
  kind: ObjectKind

  /** Display name shown in the editor library / inspector. */
  name: string

  /**
   * Visual representation. Omit for invisible markers (collision
   * zones, spawn points, etc.). When present, the engine spawns a
   * `SpriteRefComponent` on the entity.
   */
  sprite?: SpriteRef

  /**
   * How the object activates. Omit for purely passive objects (e.g.
   * decorations with collision but no interaction).
   */
  trigger?: TriggerSpec

  /**
   * Whether the player can walk *through* this object. Orthogonal
   * to `kind`: an NPC can be blocking-or-not, a chest can be
   * blocking-or-not, a teleport is normally non-blocking, a
   * Zelda-stone item is blocking even though it's `kind: 'item'`.
   *
   * Editor picks a sensible default per kind for new library
   * entries (`npc` → true, `spawn-point` → false, everything else
   * → false), but every default is overridable per definition and
   * per placement.
   *
   * See the "Common combinations" table in
   * `docs/concepts/object-system.md` for canonical recipes.
   */
  blocking?: boolean

  /**
   * Kind-specific configuration. The shape varies with `kind`:
   *
   * - `'teleport'` → {@link TeleportProperties}
   * - `'item'` → {@link ItemProperties}
   * - `'npc'` → {@link NpcProperties}
   * - `'spawn-point'` → {@link SpawnPointProperties}
   * - `'event'` / `'custom'` → free-form `Record<string, unknown>`
   *
   * Use a discriminated-union resolver at consumer sites (e.g.
   * the spawn system) rather than trying to type-narrow this
   * directly — the union is intentionally loose at the schema
   * boundary so future kinds can extend it without breaking
   * existing JSON.
   */
  properties?: ObjectProperties

  /**
   * Editor-only metadata. Engine ignores. Used for library tab
   * categorisation and icon overrides.
   */
  editorData?: {
    category?: string
    icon?: string
  }
}

/**
 * The set of "kinds" an object can be. Trimmed to cases that
 * actually deserve dedicated editor UX. Door / sign / shop / chest
 * etc. start as `'event'` and only get promoted to their own kind
 * when the cost of the special-casing earns its place.
 */
export type ObjectKind =
  | 'event' // generic — fires a trigger, optional script
  | 'teleport' // scene-switch trigger
  | 'item' // pickup → inventory
  | 'npc' // pathing, dialogue
  | 'spawn-point' // entity spawn marker (player, mob, …)
  | 'custom' // escape hatch for project-specific shapes

/** Reference to a sprite within a sprite-set. */
export interface SpriteRef {
  spriteSetId: string
  spriteId: number
  /** Optional animation cycle id defined in the sprite-set. */
  animationId?: string
}

/** Activation rules for an object. */
export interface TriggerSpec {
  /**
   * Activation mode:
   * - `'walk-onto'` — player steps onto the same tile
   * - `'walk-off'` — player leaves the tile
   * - `'action-button'` — player presses action while adjacent + facing
   * - `'auto'` — fires on scene activate (cutscene-style intros)
   * - `'none'` — passive object (rendered, no behaviour)
   */
  on: 'walk-onto' | 'walk-off' | 'action-button' | 'auto' | 'none'

  /** Fire at most once per scene visit. Defaults to `false`. */
  once?: boolean

  /**
   * Optional script reference. Engine resolves to a registered
   * handler at runtime. Script system not yet specified — see
   * the "Open questions" section of `docs/concepts/object-system.md`.
   */
  scriptId?: string
}

/** Kind-specific properties. Discriminated by the parent's `kind`. */
export type ObjectProperties =
  | TeleportProperties
  | ItemProperties
  | NpcProperties
  | SpawnPointProperties
  | Record<string, unknown> // event / custom / fallback

export interface TeleportProperties {
  targetMapId: string
  targetTileX: number
  targetTileY: number
  /** Facing direction at the destination. */
  facing?: Facing
  /** Optional pill label drawn on the atlas curve. */
  label?: string
}

export interface ItemProperties {
  itemId: string
  /** How many of this item the pickup grants. Defaults to 1. */
  qty?: number
  pickupSound?: string
  // No `oncePerScene` — use `TriggerSpec.once: true` on the parent
  // definition instead. The trigger never re-fires, so the pickup
  // can't re-run; a separate `oncePerScene` field would be dead
  // state. See `docs/concepts/object-system.md`.
}

export interface NpcProperties {
  dialogueId?: string
  /** Tile-space waypoints the NPC patrols between. */
  route?: Array<{ tileX: number; tileY: number }>
  facing?: Facing
  /**
   * Optional reference to a {@link CharacterDefinition} in
   * `GameProjectData.characters`. When set, the NPC borrows the
   * character's sprite + animations; without it, the placement's
   * inline `sprite: SpriteRef` is used (legacy fallback).
   */
  characterId?: string
}

export interface SpawnPointProperties {
  /**
   * Which entity spawns here. `'player'` is the canonical player
   * spawn; project-specific ids (e.g. `'shopkeeper'`) get resolved
   * via the project's entity registry.
   */
  spawnId: 'player' | (string & {})
  facing?: Facing
}

export type Facing = 'up' | 'down' | 'left' | 'right'

/** Type guard for `SpriteRef`. */
export function isSpriteRef(value: unknown): value is SpriteRef {
  if (value == null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.spriteSetId !== 'string') return false
  if (typeof v.spriteId !== 'number') return false
  if (v.animationId !== undefined && typeof v.animationId !== 'string') return false
  return true
}

const TRIGGER_MODES = new Set(['walk-onto', 'walk-off', 'action-button', 'auto', 'none'])

/** Type guard for `TriggerSpec`. */
export function isTriggerSpec(value: unknown): value is TriggerSpec {
  if (value == null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.on !== 'string' || !TRIGGER_MODES.has(v.on)) return false
  if (v.once !== undefined && typeof v.once !== 'boolean') return false
  if (v.scriptId !== undefined && typeof v.scriptId !== 'string') return false
  return true
}

const OBJECT_KINDS = new Set(['event', 'teleport', 'item', 'npc', 'spawn-point', 'custom'])

/** Type guard for `ObjectDefinition`. */
export function isObjectDefinition(value: unknown): value is ObjectDefinition {
  if (value == null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || v.id.length === 0) return false
  if (typeof v.kind !== 'string' || !OBJECT_KINDS.has(v.kind)) return false
  if (typeof v.name !== 'string') return false
  if (v.sprite !== undefined && !isSpriteRef(v.sprite)) return false
  if (v.trigger !== undefined && !isTriggerSpec(v.trigger)) return false
  if (v.blocking !== undefined && typeof v.blocking !== 'boolean') return false
  if (v.properties !== undefined && (typeof v.properties !== 'object' || v.properties === null)) return false
  if (v.editorData !== undefined && (typeof v.editorData !== 'object' || v.editorData === null)) return false
  return true
}
