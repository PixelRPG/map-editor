import type { EventEmitter, System } from 'excalibur'
import type { ComponentSpec } from '../entity/component-spec.ts'
import type { MapResource } from '../resource/MapResource.ts'
import type { SpriteSetResource } from '../resource/SpriteSetResource.ts'
import type { CharacterDefinition, ComponentData, EntityDefinition } from '../types/data/index.ts'
import type { EngineEventMap } from '../types/engine-events.ts'

/**
 * Game systems — the switchable bundles a project is built out of.
 *
 * An ECS `System` is engine plumbing; a **game system** is the thing a
 * user turns on: a name, a sentence, the components it owns, the editor
 * templates it offers and the ECS systems it contributes at runtime. The
 * two never blur, which is why this type exists next to Excalibur's.
 *
 * See `docs/concepts/game-systems.md` for the model, the ownership rule
 * and the dormant-vs-unknown distinction.
 */

/** How a game system presents itself in the editor. */
export interface GameSystemEditorMeta {
  /** Display label (a gettext msgid; the widget translates it). */
  label: string
  /** The one sentence a nine-year-old reads instead of the label. */
  kidLabel: string
  /** Symbolic icon name for the row prefix. */
  icon: string
  /**
   * `true` = always on, no switch rendered. Base systems are the floor
   * every project stands on; everything else is opt-in per project.
   */
  base?: boolean
}

/**
 * What a game system's `runtime` factory gets. Deliberately the same
 * arguments `MapScene` already hands its own systems, so contributing a
 * system is a registration rather than a plumbing exercise.
 */
export interface GameSystemRuntimeContext {
  readonly events: EventEmitter<EngineEventMap>
  readonly mapResource: MapResource
  readonly entityLibrary: readonly EntityDefinition[]
  /** The project's per-system settings (`GameProjectData.gameSystems[id].config`). */
  readonly config: Readonly<Record<string, unknown>>
  /** The resolved player definition, when the project names one. */
  readonly playerCharacter?: CharacterDefinition
  /** The player's sprite set, when it resolved. */
  readonly playerSpriteSet?: SpriteSetResource
}

/**
 * An editor **template** — a named starting point for a new entity
 * definition: a label, an icon, and the component set it seeds.
 * Templates are the friendly "what kind of thing is this" front door to
 * the component model (RPG-Maker-style database UX). They are an EDITOR
 * concern only — the persisted entity is just `components[]` +
 * `editorData.template` (the stamp recording which template seeded it).
 *
 * Declared here rather than in the editor because a game system ships
 * templates of its own, and the ownership guard checks that a template
 * only seeds components its system can actually render.
 */
export interface EntityTemplate {
  /** Stable id, stamped into `editorData.template`. */
  id: string
  /** Display label in the "New object" chooser. */
  label: string
  /** Symbolic icon for the chooser row. */
  icon: string
  /** One-line description for the chooser row subtitle. */
  description: string
  /**
   * The Library › Things group a fresh entity lands in, stamped into
   * `editorData.category`. Absent = the uncategorised "Objects" group.
   */
  category?: string
  /** The component set a fresh entity of this template starts with. */
  components: ComponentData[]
}

/**
 * One switchable bundle of gameplay: components, settings, templates and
 * the ECS systems that make them do something.
 *
 * Deliberately absent for now, each because nothing would render or run
 * it yet: a `config` field list (needs the generated row builder the
 * inspector's is being extracted into), per-map `mapFields` (needs the
 * map Props surface), extra Excalibur `scenes` (needs `combat-turn`),
 * `starter` packs (need a switchable system to seed for) and
 * `regionKinds` (regions are deferred with the two systems that want
 * them). Each is a registration away once its consumer exists — see
 * `docs/concepts/game-systems.md` § Reach. The per-project settings BAG
 * (`GameProjectData.gameSystems[id].config`) does exist and is plumbed
 * end to end, so a value written by a newer build round-trips and
 * reaches `runtime(ctx).config` untouched.
 */
export interface GameSystemSpec {
  /** Stable id — the wire + save key in `GameProjectData.gameSystems`. */
  id: string
  editor: GameSystemEditorMeta
  /**
   * Other game systems that must be on. Enabling this one auto-enables
   * them; switching one off while a dependent is on is refused. The
   * ownership guard checks the graph closes over registered ids and has
   * no cycle.
   */
  requires?: readonly string[]
  /**
   * Components this system OWNS. Exactly one owner per component type —
   * the ownership guard fails the build on a duplicate or an orphan, so
   * `BUILT_IN_COMPONENT_SPECS` can be derived rather than hand-listed.
   */
  components: readonly ComponentSpec[]
  /** Editor templates the "New object" chooser offers while this system is on. */
  templates?: readonly EntityTemplate[]
  /** ECS systems appended to `MapScene` (after the editor systems) while this system is on. */
  runtime: (ctx: GameSystemRuntimeContext) => System[]
}

/**
 * Runtime guard used by the auto-discovery ownership test — mirrors
 * {@link isComponentSpec}. Shape only: the registration assertions live
 * in `game-systems/registry.spec.ts`.
 */
export function isGameSystemSpec(value: unknown): value is GameSystemSpec {
  if (value == null || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  return (
    typeof s.id === 'string' &&
    typeof s.runtime === 'function' &&
    Array.isArray(s.components) &&
    typeof s.editor === 'object' &&
    s.editor !== null
  )
}
