/**
 * The engine widget cannot serve this call and never will: it was torn
 * down, or its canvas / Excalibur start-up failed.
 *
 * Exists so callers get a rejection instead of a promise that stays
 * pending. `Engine.loadProject` / `loadMap` wait for the canvas to
 * become ready, and a widget that never will used to park every caller
 * forever — the editor then showed a scene-editor page with no engine,
 * no error, and no way back for the rest of the session.
 */
export class EngineUnavailableError extends Error {
  constructor(reason: string) {
    super(`Engine unavailable: ${reason}`)
    this.name = 'EngineUnavailableError'
  }
}
