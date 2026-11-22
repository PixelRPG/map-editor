/**
 * The Game page's sections, in sidebar order. Start leads: it holds the
 * title card with "Play from the start", which is what most visits are
 * for. Shared by `GameView` and the `win.game-section` action.
 */
export const GAME_SECTIONS = ['start', 'rules', 'languages', 'checkup', 'about'] as const

/** One of the Game page's sections. */
export type GameSection = (typeof GAME_SECTIONS)[number]

export const DEFAULT_GAME_SECTION: GameSection = 'start'

/** Whether an arbitrary string (a GAction parameter, say) names a section. */
export function isGameSection(value: string): value is GameSection {
  return (GAME_SECTIONS as readonly string[]).includes(value)
}
