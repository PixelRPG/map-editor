/**
 * Project configuration for loading games
 */
export interface GameProject {
  /**
   * Unique identifier of the game
   */
  id: string

  /**
   * Display name of the game
   */
  name: string

  /**
   * Path to the game project configuration file (JSON)
   */
  configPath: string
}
