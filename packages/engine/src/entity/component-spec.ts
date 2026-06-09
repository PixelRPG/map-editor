import type { Component } from 'excalibur'
import type { ComponentData } from '../types/data/EntityDefinition.ts'

/**
 * Component spec — the engine-side description of one component type:
 * how to validate + edit its data (`fields`), how to instantiate it at
 * spawn (`build`), and how the editor presents it (`editor`).
 *
 * Specs are registered in `BUILT_IN_COMPONENT_SPECS` (registry.ts).
 * Mirrors the `BUILT_IN_COMMANDS` discipline: an `EntityDefinition`
 * referencing an unregistered component `type` fails validation loudly
 * (no silent-skip), and the registry is open — the future code editor
 * registers user specs the same way (spread on top).
 *
 * See `docs/concepts/entity-and-appearance-model.md`.
 */

/**
 * Input kind for one editable field. Maps 1:1 onto an Adwaita row in the
 * generated inspector (text → EntryRow, int/float → SpinRow, bool →
 * SwitchRow, select/facing/*-ref → ComboRow, json → EntryRow + parse
 * guard). The `*-ref` kinds are pickers the editor feeds with
 * project-scoped options (the engine can't know the project's maps /
 * appearances); the engine validates them as plain strings.
 */
export type FieldInput =
  | 'text'
  | 'int'
  | 'float'
  | 'bool'
  | 'select'
  | 'map-ref'
  | 'appearance-ref'
  | 'sprite-ref'
  | 'facing'
  | 'json'

/** One choice for a `select` field. */
export interface FieldOption {
  value: string
  label: string
}

/**
 * One editable field of a component's data — the single source for both
 * validation (entity/validate.ts) and the generated inspector UI.
 */
export interface FieldDescriptor {
  /** Flat key into the {@link ComponentData}. */
  key: string
  /** Display label (a gettext msgid; the widget translates it). */
  label: string
  input: FieldInput
  /** Validation rejects missing/empty when true. */
  required?: boolean
  /**
   * Progressive-disclosure tier: `true` = surfaced by default (the
   * friendly inspector + templates), `false`/absent = behind "all
   * components".
   */
  basic?: boolean
  default?: unknown
  /** Numeric bounds (int/float). */
  min?: number
  max?: number
  step?: number
  /** Choices for a `select` field. */
  options?: readonly FieldOption[]
}

/** Editor presentation metadata for a component type. */
export interface ComponentEditorMeta {
  /** Group label in the inspector (a gettext msgid). */
  label: string
  /** Symbolic icon name for the component + the library card. */
  icon: string
  /**
   * Outline colour for a sprite-less placement carrying this component
   * (replaces the old per-kind `KIND_MARKER_COLORS`). The placement takes
   * the highest-priority component's colour; absent = not a marker source.
   */
  markerColor?: string
  /** Whether this component is part of the friendly default surface. */
  basic?: boolean
}

/**
 * Spawn-time helper passed to a spec's `build`. Minimal by design — most
 * components map data → component with no context. The visual graphic +
 * actor positioning are the spawn pipeline's job, not `build`'s.
 */
export interface SpawnContext {
  readonly placementId: string
  readonly tileX: number
  readonly tileY: number
  readonly tileWidth: number
  readonly tileHeight: number
}

/**
 * The registered description of one component type. `build` narrows the
 * loose {@link ComponentData} internally (same pattern as the command
 * registry's `(payload) => new X(payload as XPayload)`), so the whole
 * registry stays a uniform `Record<string, ComponentSpec>` with no
 * generic-variance friction.
 *
 * `build` returns `null` for data-only components that carry no runtime
 * component (e.g. `movement`, read by `PlayerSystem` from the definition
 * data rather than instantiated as an ECS component).
 */
export interface ComponentSpec {
  type: string
  fields: readonly FieldDescriptor[]
  editor: ComponentEditorMeta
  build: (data: ComponentData, ctx: SpawnContext) => Component | Component[] | null
}

/** A component type → its spec. Open: spread to add user specs. */
export type ComponentSpecRegistry = Record<string, ComponentSpec>

/** Runtime guard used by the auto-discovery completeness test. */
export function isComponentSpec(value: unknown): value is ComponentSpec {
  if (value == null || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  return (
    typeof s.type === 'string' &&
    Array.isArray(s.fields) &&
    typeof s.build === 'function' &&
    typeof s.editor === 'object' &&
    s.editor !== null
  )
}
