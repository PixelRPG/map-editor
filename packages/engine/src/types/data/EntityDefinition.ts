/**
 * Entity-composition data model — the project-level definition of "a
 * thing in the world" as an explicit list of component configs, not a
 * `kind`-discriminated shape.
 *
 * See `docs/concepts/entity-and-appearance-model.md`. A character, an
 * NPC, an item, a teleport and an event are all `EntityDefinition`s —
 * they differ only in which components they carry. The engine spawns
 * one Excalibur entity per placement by walking `components[]` and
 * asking the component registry to instantiate each one (no per-kind
 * switch).
 */

/**
 * One serialisable component config. `type` keys into the component
 * registry (`BUILT_IN_COMPONENT_SPECS`); the remaining fields are the
 * component's data, validated against the spec's `fields` descriptors.
 *
 * Loose by design at the schema boundary (a `Record` of unknown) so a
 * future / user-registered component type round-trips through JSON
 * without the core types knowing its shape. Consumers narrow via the
 * registry, never by hand.
 */
export type ComponentData = { type: string } & Record<string, unknown>

import type { Condition } from './Condition.ts'

/** A value a game flag can hold. Deliberately JSON-primitive only. */
export type FlagValue = boolean | number | string

/**
 * A conditional overlay of components — the no-code behaviour tier
 * (RPG-Maker event pages, modernised). When `when` matches, the state's
 * `components` replace the base components of the same `type` (wholesale,
 * per type).
 *
 * **In this build only an `actions` overlay has a runtime**: `StateSystem`
 * swaps the entity's action list, so "the door teleports you once you have
 * the key" works, while a `visual` or `collision` overlay validates with a
 * warning and stays inert (a chest still looks closed after it gave you
 * its item). Rebuilding a live entity's sprite + collider mid-frame is its
 * own piece of engine work — see TODO.md.
 */
export interface EntityState {
  /** Stable id within the definition (`'open'`, `'night'`, …). */
  id: string
  /**
   * Activation condition. First matching state wins; absent = a
   * manually/scripted-switched state, never auto-activated.
   */
  when?: Condition
  /** Components overlaid on the base when this state is active. */
  components: ComponentData[]
}

/** Type guard for a {@link FlagValue}. */
export function isFlagValue(value: unknown): value is FlagValue {
  const t = typeof value
  return t === 'boolean' || t === 'string' || (t === 'number' && Number.isFinite(value))
}

/**
 * A reusable, named, project-level definition: a list of components
 * (+ optional conditional states). Lives in
 * `GameProjectData.entityLibrary`; placements reference it by id and
 * patch it with per-instance overrides.
 */
export interface EntityDefinition {
  /** Stable, project-unique id used by placements via `defId`. */
  id: string
  /** Display name shown in the editor library / inspector. */
  name: string
  /**
   * THE composition: typed, serialisable component data. Order is not
   * semantic. Each entry's `type` must be a registered component spec.
   */
  components: ComponentData[]
  /** Conditional component overlays — see {@link EntityState} (Phase D). */
  states?: EntityState[]
  /**
   * Editor-only metadata. The engine ignores it. `template` names the
   * editor preset that seeded the definition (e.g. `'npc'`, `'character'`)
   * — pure categorisation, zero runtime semantics.
   */
  editorData?: {
    template?: string
    category?: string
    icon?: string
  }
}

/** Type guard for {@link ComponentData}. */
export function isComponentData(value: unknown): value is ComponentData {
  if (value == null || typeof value !== 'object') return false
  return typeof (value as { type?: unknown }).type === 'string'
}

/**
 * Structural type guard for {@link EntityDefinition} — shape only, not
 * registry-aware. Use `validateEntityDefinition` (entity/validate.ts)
 * for the registry-aware check that rejects unregistered component types.
 */
export function isEntityDefinition(value: unknown): value is EntityDefinition {
  if (value == null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || v.id.length === 0) return false
  if (typeof v.name !== 'string') return false
  if (!Array.isArray(v.components) || !v.components.every(isComponentData)) return false
  if (v.states !== undefined) {
    if (!Array.isArray(v.states)) return false
    for (const s of v.states) {
      if (s == null || typeof s !== 'object') return false
      const st = s as Record<string, unknown>
      if (typeof st.id !== 'string') return false
      if (!Array.isArray(st.components) || !st.components.every(isComponentData)) return false
    }
  }
  if (v.editorData !== undefined && (typeof v.editorData !== 'object' || v.editorData === null)) return false
  return true
}
