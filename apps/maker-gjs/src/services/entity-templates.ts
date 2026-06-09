import type { ComponentData } from '@pixelrpg/engine'

/**
 * An editor **template** — a named starting point for a new entity
 * definition: a label, an icon, and the component set it seeds. Templates
 * are the friendly "what kind of thing is this" front door to the
 * component model (RPG-Maker-style database UX). They are an EDITOR
 * concern only — the persisted entity is just `components[]` +
 * `editorData.template` (the stamp recording which template seeded it).
 *
 * See `docs/concepts/entity-and-appearance-model.md`. New templates can be
 * added freely; they compose the same `BUILT_IN_COMPONENT_SPECS` the
 * generated inspector edits, so a template never adds capability the
 * registry lacks.
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
  /** The component set a fresh entity of this template starts with. */
  components: ComponentData[]
}

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
  },
]

/** Look a template up by id. */
export function findEntityTemplate(id: string): EntityTemplate | undefined {
  return ENTITY_TEMPLATES.find((t) => t.id === id)
}
