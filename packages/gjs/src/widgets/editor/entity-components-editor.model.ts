import {
  BUILT_IN_COMPONENT_SPECS,
  BUILT_IN_GAME_SYSTEMS,
  type ComponentSpec,
  type ComponentSpecRegistry,
  type GameSystemSpec,
} from '@pixelrpg/engine'

/**
 * What the components editor needs to DECIDE, kept out of the widget so
 * it is testable without a display: which abilities a thing can still be
 * given (and under which heading), and what to say about a component
 * whose game system is switched off.
 */

/** One heading in the "Add an ability" dialog: a game system + its addable components. */
export interface AddableComponentGroup {
  /** The owning system's stable id. */
  systemId: string
  /** The system's label — a msgid; the widget translates it. */
  systemLabel: string
  specs: readonly ComponentSpec[]
}

/**
 * The addable components, grouped under the game system that owns them.
 *
 * Grouping by system rather than listing one flat alphabet is what makes
 * the dialog answer "what can this thing do" instead of "what component
 * types exist": the headings are the same words the Game › Rules page
 * uses, so a child who turned "Fighting" on finds its abilities together.
 *
 * `offered` is the registry the editor's tier offers (already trimmed to
 * the project's effective systems and the host's exclusions), so a
 * switched-off system contributes nothing here by construction. Groups
 * come in registry order — the order Rules lists the systems in — and an
 * empty one is dropped rather than shown as a bare heading.
 */
export function addableComponentGroups(
  offered: ComponentSpecRegistry,
  present: readonly string[],
  systems: Record<string, GameSystemSpec> = BUILT_IN_GAME_SYSTEMS,
): AddableComponentGroup[] {
  const taken = new Set(present)
  const addable = Object.values(offered).filter((spec) => !taken.has(spec.type))
  const groups: AddableComponentGroup[] = []
  for (const system of Object.values(systems)) {
    const specs = addable.filter((spec) => spec.system === system.id)
    if (specs.length > 0) {
      groups.push({ systemId: system.id, systemLabel: system.editor.label, specs })
    }
  }
  return groups
}

/** Why a component on the entity renders no editor, and what would fix it. */
export interface DormantComponentFacts {
  /** The component type as stored on the definition. */
  type: string
  /** The component's label — a msgid; the widget translates it. */
  componentLabel: string
  /** Symbolic icon of the component, for the dormant row's prefix. */
  icon: string
  /** The game system to switch on. What the row's button targets. */
  systemId: string
  /** That system's label — a msgid; the widget translates it. */
  systemLabel: string
}

/**
 * Facts about a component this build knows but the project has switched
 * OFF — `null` for anything else, including a type no build knows.
 *
 * The distinction is the whole point (see `docs/concepts/game-systems.md`
 * § Off means dormant): dormant data is intact and one switch away from
 * working, so it earns a row that says so and offers the switch. An
 * UNKNOWN type gets nothing here on purpose — there is no system to turn
 * on, and validation already reports it loudly; inventing a "turn on"
 * button for it would promise a fix that does not exist.
 */
export function dormantComponentFacts(
  type: string,
  effective: ComponentSpecRegistry,
  systems: Record<string, GameSystemSpec> = BUILT_IN_GAME_SYSTEMS,
  known: ComponentSpecRegistry = BUILT_IN_COMPONENT_SPECS,
): DormantComponentFacts | null {
  if (effective[type]) return null
  const spec = known[type]
  if (!spec) return null
  const system = systems[spec.system]
  if (!system) return null
  return {
    type,
    componentLabel: spec.editor.label,
    icon: spec.editor.icon,
    systemId: system.id,
    systemLabel: system.editor.label,
  }
}
