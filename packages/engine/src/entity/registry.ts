import { type ComponentSpec, type ComponentSpecRegistry, isComponentSpec } from './component-spec.ts'
import * as Specs from './specs/index.ts'

/**
 * Built-in component registry — every component `type` an
 * `EntityDefinition` can carry, keyed by spec `type`. The spawn pipeline
 * walks a definition's `components[]` and looks each up here to build the
 * runtime component; validation rejects any `type` absent from this map.
 *
 * **Derived, never hand-listed.** The entries are discovered from the
 * `specs/` barrel (`check:barrels` guarantees the barrel re-exports every
 * `specs/*.ts`), so a new spec file cannot be forgotten here. Which game
 * system OWNS each spec is the spec's own `system` field, and
 * `game-systems/registry.spec.ts` fails the build unless every discovered
 * spec is claimed by exactly one registered game system — that assertion,
 * not a hand-written map, is what keeps a component from existing without
 * an owner.
 *
 * This map is the FULL set (every system's components, enabled or not).
 * The set a given project may actually use is
 * `effectiveComponentRegistry(project)` — base systems plus whatever the
 * project switched on. Components of a known-but-disabled system are
 * *dormant*, not unknown: preserved, inert, and reported separately by
 * `validateEntityDefinitionDetailed`.
 *
 * Open like `BUILT_IN_COMMANDS`: a consumer (the future code editor)
 * layers user specs on top by spreading —
 *
 * ```ts
 * const registry = { ...BUILT_IN_COMPONENT_SPECS, [mySpec.type]: mySpec }
 * ```
 */
export const BUILT_IN_COMPONENT_SPECS: ComponentSpecRegistry = Object.fromEntries(
  discoverComponentSpecs().map((spec) => [spec.type, spec]),
)

/**
 * Every component spec shipped under `entity/specs/`, discovered from the
 * generated barrel. Exported so the game-system ownership guard checks
 * the same set the registry is built from (a second, independent walk
 * could disagree with this one and hide exactly the gap it guards).
 */
export function discoverComponentSpecs(): ComponentSpec[] {
  return (Object.values(Specs) as unknown[]).filter(isComponentSpec)
}
