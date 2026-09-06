import { effectiveGameSystems, type EntityTemplate, type GameProjectData } from '@pixelrpg/engine'

/**
 * Editor templates — the friendly "what kind of thing is this" front
 * door to the component model (RPG-Maker-style database UX).
 *
 * {@link EntityTemplate} itself now lives in `@pixelrpg/engine` because a
 * game system ships templates of its own, and the ownership guard checks
 * that a template only seeds components its system can actually render.
 * Re-exported here so the editor's existing imports keep working.
 *
 * See `docs/concepts/entity-and-appearance-model.md` and
 * `docs/concepts/game-systems.md`.
 */
export type { EntityTemplate }

/**
 * The v1 built-in template set. `character` is owned by the Cast view;
 * the rest are world objects placed on maps. Each seeds sensible defaults
 * the user then refines in the inspector.
 */
export const ENTITY_TEMPLATES: EntityTemplate[] = [
  {
    id: 'npc',
    label: 'NPC',
    icon: 'avatar-default-symbolic',
    description: 'A character that walks a route + talks when interacted with.',
    // The same group a demoted cast NPC keeps, so world NPCs and former
    // cast NPCs sit together under Things.
    category: 'npc',
    components: [
      { type: 'visual', spriteSetId: '', spriteId: 0 },
      { type: 'movement', tilesPerSec: 3 },
      { type: 'dialogue', dialogueId: '' },
      { type: 'trigger', on: 'action-button' },
    ],
  },
  {
    id: 'item',
    label: 'Item',
    icon: 'starred-symbolic',
    description: 'A pickup the player collects by walking onto it.',
    components: [
      { type: 'visual', spriteSetId: '', spriteId: 0 },
      { type: 'item', itemId: '', qty: 1 },
      { type: 'trigger', on: 'walk-onto' },
    ],
  },
  {
    id: 'teleport',
    label: 'Teleport',
    icon: 'mail-forward-symbolic',
    description: 'A pad that moves the player to another map / tile.',
    components: [
      { type: 'trigger', on: 'walk-onto' },
      { type: 'teleport', targetMapId: '', targetTileX: 0, targetTileY: 0 },
    ],
  },
  {
    id: 'event',
    label: 'Event',
    icon: 'preferences-system-symbolic',
    description: 'A trigger zone that fires a script (no sprite by default).',
    components: [{ type: 'trigger', on: 'walk-onto' }],
  },
  {
    id: 'chest',
    label: 'Chest',
    icon: 'package-x-generic-symbolic',
    description: 'A container the player opens to receive an item.',
    components: [
      { type: 'visual', spriteSetId: '', spriteId: 0 },
      { type: 'collision' },
      { type: 'trigger', on: 'action-button' },
      {
        type: 'actions',
        actions: [
          { id: 'a-give', type: 'give-item', itemId: '', qty: 1 },
          { id: 'a-flag', type: 'set-flag', flag: '', value: true },
        ],
      },
    ],
  },
  {
    id: 'sign',
    label: 'Sign',
    icon: 'view-list-symbolic',
    description: 'A signpost that shows a line of text when read.',
    components: [
      { type: 'visual', spriteSetId: '', spriteId: 0 },
      { type: 'collision' },
      { type: 'trigger', on: 'action-button' },
      { type: 'actions', actions: [{ id: 'a-text', type: 'show-text', text: '' }] },
    ],
  },
  {
    id: 'door',
    label: 'Door',
    icon: 'go-next-symbolic',
    description: 'A door the player opens to travel to another map.',
    components: [
      { type: 'visual', spriteSetId: '', spriteId: 0 },
      { type: 'collision' },
      { type: 'trigger', on: 'action-button' },
      {
        type: 'actions',
        actions: [{ id: 'a-tp', type: 'teleport', targetMapId: '', targetTileX: 0, targetTileY: 0 }],
      },
    ],
  },
  {
    id: 'trigger',
    label: 'Trigger',
    icon: 'media-playback-start-symbolic',
    description: 'An invisible zone that runs an action list on entry.',
    components: [
      { type: 'trigger', on: 'walk-onto' },
      { type: 'actions', actions: [] },
    ],
  },
  {
    id: 'spawn-point',
    label: 'Spawn point',
    icon: 'go-home-symbolic',
    description: 'Marks where the player (or an NPC) enters a map.',
    components: [{ type: 'spawn-point', spawnId: 'player' }],
  },
  {
    id: 'custom',
    label: 'Blank',
    icon: 'view-grid-symbolic',
    description: 'An empty entity — add components yourself.',
    components: [],
    fullViewOnly: true,
  },
]

/**
 * Every template the "New object" chooser offers for a project: the
 * built-in set plus the templates of each switched-on game system.
 *
 * A system's templates appear the moment it is enabled and disappear
 * when it is switched off — the chooser must never offer a template that
 * seeds components the project cannot render.
 */
export function entityTemplatesFor(project?: Pick<GameProjectData, 'gameSystems'> | null): EntityTemplate[] {
  const fromSystems = effectiveGameSystems(project).flatMap((system) => [...(system.templates ?? [])])
  return [...ENTITY_TEMPLATES, ...fromSystems]
}

/**
 * The templates one view tier offers: Full view every one, Simple view
 * all but the `fullViewOnly` ones. `entity-templates.spec.ts` pins that
 * every Simple-view template seeds only Simple-view components with
 * nothing hidden, so a child never meets the count row on a fresh object.
 */
export function templatesForView(templates: readonly EntityTemplate[], fullView: boolean): EntityTemplate[] {
  return fullView ? [...templates] : templates.filter((template) => template.fullViewOnly !== true)
}

/** Look a template up by id, across the built-ins and `project`'s systems. */
export function findEntityTemplate(
  id: string,
  project?: Pick<GameProjectData, 'gameSystems'> | null,
): EntityTemplate | undefined {
  return entityTemplatesFor(project).find((t) => t.id === id)
}
