import { Engine, EngineEvent } from '@pixelrpg/engine-excalibur'

/**
 * Bootstraps the Excalibur engine against a <canvas id="game"> in index.html
 * and loads the zelda-like project as a demo. Keep this intentionally tiny —
 * it exists to prove the engine runs without a GTK host.
 */
async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null
  if (!canvas) {
    throw new Error('No <canvas id="game"> found in index.html')
  }

  const engine = new Engine(canvas)
  engine.events.on(EngineEvent.ERROR, ({ message, cause }) => {
    console.error('[game-browser] engine error:', message, cause)
  })

  await engine.initialize()

  // The `start` script serves the repo root, so index.html lives at
  // /apps/game-browser/dist/ while the zelda-like assets live at
  // /games/zelda-like/. Absolute path from origin avoids depending on
  // how deep the HTML file is served from.
  const projectPath = new URL('/games/zelda-like/game-project.json', window.location.origin).toString()
  await engine.loadProject(projectPath)
}

main().catch((err) => {
  console.error('[game-browser] bootstrap failed:', err)
})
