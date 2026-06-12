import { PREFIX } from '../constants.ts'

/**
 * Descriptor for a starter template surfaced in the welcome view.
 *
 * Templates are **real workspace packages** under `games/<id>/`, each
 * with its own `game-project.json`, `maps/`, and optionally `spritesets/`.
 * Picking a template opens the corresponding project for editing — the
 * same code path as "Open Project" with a different starting file.
 *
 * Two flows route through templates:
 * - **New Project** → opens the `blank-starter` template, then in a
 *   future iteration scaffolds it into a user directory.
 * - **Start from Template** (welcome cards) → opens the picked template
 *   directly.
 */
export interface ProjectTemplate {
  /** Stable id used by `template-selected` signals. */
  id: string
  /** Display name in the welcome card. */
  name: string
  /** Caption beneath the name. */
  caption: string
  /**
   * Absolute filesystem path to the template's `game-project.json`.
   * Resolved from the maker's `PREFIX` (i.e. `apps/maker-gjs/`).
   */
  projectPath: string
  /** Tint colour used as the card preview fallback (e.g. blank scenes). */
  accentColor: string
  /** Whether this is the "blank" template used by *New Project*. */
  isBlank?: boolean
}

const TEMPLATES_ROOT = `${PREFIX}/../../games`

export const STARTER_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'blank-starter',
    name: 'Blank Project',
    caption: 'Empty 20×14 scene',
    projectPath: `${TEMPLATES_ROOT}/blank-starter/game-project.json`,
    accentColor: '#535c68',
    isBlank: true,
  },
  {
    id: 'minimalist-starter',
    name: 'Minimalist Starter',
    caption: 'Overworld · dungeon · town · teleports',
    projectPath: `${TEMPLATES_ROOT}/minimalist-starter/game-project.json`,
    accentColor: '#5fb04c',
  },
  {
    id: 'kokiri-forest',
    name: 'Kokiri Forest',
    caption: 'Zelda-like demo (full art)',
    projectPath: `${TEMPLATES_ROOT}/zelda-like/game-project.json`,
    accentColor: '#3d6b3a',
  },
  {
    id: 'oot2d-2014',
    name: 'OoT2D 2014 World',
    caption: '19 converted reference maps · 8px tiles',
    projectPath: `${TEMPLATES_ROOT}/oot2d-2014/game-project.json`,
    accentColor: '#c4a24c',
  },
]

/** Convenience: look up the template used by the *New Project* flow. */
export function findBlankTemplate(): ProjectTemplate | null {
  return STARTER_TEMPLATES.find((t) => t.isBlank) ?? null
}

/** Convenience: look up a template by id. */
export function findTemplateById(id: string): ProjectTemplate | null {
  return STARTER_TEMPLATES.find((t) => t.id === id) ?? null
}
