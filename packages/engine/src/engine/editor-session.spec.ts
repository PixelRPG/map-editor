/**
 * A tile brush and a terrain brush are two answers to the same
 * question — "what does the next stroke lay" — so exactly one of them
 * may be armed (TERRAIN.md §6.2).
 *
 * The failure this pins down is quiet and total: with both components
 * attached, every mutating path that reads the terrain first
 * (`TileEditorSystem.applyMutatingTool`, the pencil ghost, the fill
 * region) keeps painting terrain while the palette highlights the tile
 * the user just picked. Nothing throws; the editor simply stops
 * obeying the last thing that was clicked.
 *
 * It holds because ONE private write arms a tile brush, so this suite
 * exercises both public ways in — the single-tile lens and the stamp —
 * and the terrain setter in the other direction.
 */

import { describe, expect, it } from '@gjsify/unit'
import { EventEmitter, Scene } from 'excalibur'

import { ActiveTerrainComponent, ActiveTileComponent } from '../components/index.ts'
import { singleTileStamp } from '../resource/tile-stamp.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import type { EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { EditorSession } from './editor-session.ts'

const PATH = { spriteSetId: 'pack', terrainId: 'path' }

/**
 * A real Excalibur `Scene` — the session-singleton lives in its entity
 * list, and attach / detach is what this suite is about, so the stub
 * would be the thing under test.
 */
function makeSession(): { session: EditorSession; scene: Scene } {
  const scene = new Scene()
  const session = new EditorSession(() => scene as unknown as MapScene, new EventEmitter<EngineEventMap>())
  return { session, scene }
}

export default async function editorSessionSuite(): Promise<void> {
  await describe('EditorSession — one armed brush', async () => {
    await it('clears the armed terrain when a tile is armed', async () => {
      const { session, scene } = makeSession()
      session.activeTerrain = PATH

      session.activeTile = 7

      expect(session.activeTerrain).toBeNull()
      // Read through the component too: the accessor could agree with
      // itself while the component the systems read stayed attached.
      expect(SessionState.get(scene, ActiveTerrainComponent)).toBeNull()
      expect(session.activeTile).toBe(7)
    })

    await it('clears it when a STAMP is armed', async () => {
      const { session, scene } = makeSession()
      session.activeTerrain = PATH

      session.activeStamp = singleTileStamp(7)

      expect(SessionState.get(scene, ActiveTerrainComponent)).toBeNull()
      expect(session.activeStamp?.spriteIds).toStrictEqual([7])
    })

    await it('clears the armed tile when a terrain is armed', async () => {
      const { session, scene } = makeSession()
      session.activeTile = 7

      session.activeTerrain = PATH

      expect(session.activeTile).toBeNull()
      expect(SessionState.get(scene, ActiveTileComponent)).toBeNull()
      expect(session.activeTerrain).toStrictEqual(PATH)
    })

    await it('disarms both on null, so "nothing armed" is one state', async () => {
      const { session, scene } = makeSession()
      session.activeTerrain = PATH

      session.activeTerrain = null

      expect(session.activeTerrain).toBeNull()
      expect(session.activeTile).toBeNull()
      expect(SessionState.get(scene, ActiveTerrainComponent)).toBeNull()
      expect(SessionState.get(scene, ActiveTileComponent)).toBeNull()
    })

    await it('reports nothing armed without an open map', async () => {
      const session = new EditorSession(() => null, new EventEmitter<EngineEventMap>())
      // Writes from UI handlers can land before the first map opens.
      session.activeTerrain = PATH
      expect(session.activeTerrain).toBeNull()
    })
  })
}
