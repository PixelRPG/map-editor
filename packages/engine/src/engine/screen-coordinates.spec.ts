/**
 * Screen → world → tile, pinned against a REAL Excalibur `Screen`.
 *
 * Three call sites turn a pointer position into map coordinates —
 * `pointer-observers.ts` twice (`observePointerWorld`,
 * `observePointerTile`) and `tile-editor.system.ts`
 * (`findTileUnderPointer`) — and all three go through
 * `screen.screenToWorldCoordinates`. Excalibur 1.0 re-roots screen space
 * at `Screen.contentArea` and introduces `contentAreaOffset`, so the
 * arithmetic behind every paint, hover and remote cursor changes owner
 * between versions.
 *
 * This suite therefore drives Excalibur's own `Screen` and `Camera`
 * rather than a re-implementation: it is written to pass on 0.32 and to
 * fail loudly if 1.0 moves the origin under us. A silent off-by-inset
 * puts every painted tile one row out, which no type-check and no
 * visual smoke test would catch.
 *
 * `DisplayMode.FillContainer` and `setViewportInset` are both
 * represented, because that is the combination the app actually ships:
 * the GL surface is never resized for the phone sheet — the camera is
 * aimed at the centre of the part that is still visible
 * (`services/viewport-inset.ts`).
 */

import { describe, expect, it } from '@gjsify/unit'
import { Camera, DisplayMode, Screen, type Vector, vec } from 'excalibur'

import { insetCameraTarget, normalizeViewportInset } from '../services/viewport-inset.ts'
import { worldToTile } from '../services/tile-geometry.ts'

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const TILE = 16

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/**
 * Excalibur's `Screen` reaches for three DOM globals while constructing:
 * `ResizeObserver` (it observes the canvas' parent under every
 * `*Container` display mode), `Window` (an `instanceof` test that
 * decides between observing the parent and listening on the browser
 * window) and `document` (`applyResolutionAndViewport` publishes
 * `--ex-pixel-ratio` on the document element — 0.32 and 1.0.1 alike).
 *
 * The observer has to be REPLACED, not merely defaulted: GJS ships a
 * real one, and it reaches into the observed node (`_onResize`), which a
 * stub canvas parent does not have. The suite never resizes, so an inert
 * observer loses nothing. `document` is the other way round — GJS has
 * one, Node does not, so it is only filled in when missing.
 *
 * Everything is restored afterwards: `test.mts` runs every suite in one
 * process, and a leaked `document` would quietly push other specs down
 * Excalibur's browser branches.
 */
function installScreenGlobals(): () => void {
  const globals = globalThis as Record<string, unknown>
  const hadObserver = 'ResizeObserver' in globals
  const previousObserver = globals.ResizeObserver
  globals.ResizeObserver = ResizeObserverStub

  if (globals.Window === undefined) globals.Window = class WindowStub {}

  const hadDocument = globals.document !== undefined
  if (!hadDocument) {
    globals.document = {
      documentElement: { style: { setProperty: () => {} } },
      body: { style: {} as Record<string, string> },
    }
  }

  return () => {
    if (hadObserver) globals.ResizeObserver = previousObserver
    else delete globals.ResizeObserver
    if (!hadDocument) delete globals.document
  }
}

interface ScreenFixture {
  readonly screen: Screen
  readonly camera: Camera
  dispose(): void
}

/**
 * A `Screen` in `DisplayMode.FillContainer` with a camera attached, both
 * genuinely Excalibur's. The canvas, graphics context and browser are
 * stubs: `Screen` only reads sizes off the canvas and writes style
 * strings nobody renders.
 */
function makeScreen(options: { zoom?: number; cameraPos?: Vector } = {}): ScreenFixture {
  const restoreGlobals = installScreenGlobals()

  const canvas = {
    offsetWidth: CANVAS_WIDTH,
    offsetHeight: CANVAS_HEIGHT,
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    parentElement: {
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  const context = {
    updateViewport: () => {},
    resetTransform: () => {},
    scale: () => {},
    smoothing: false,
  }

  const mediaQueryList = {
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const browser = {
    window: {
      nativeComponent: { matchMedia: () => mediaQueryList },
      on: () => {},
      off: () => {},
      clear: () => {},
    },
  }

  const screen = new Screen({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: context as unknown as ConstructorParameters<typeof Screen>[0]['context'],
    browser: browser as unknown as ConstructorParameters<typeof Screen>[0]['browser'],
    viewport: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    displayMode: DisplayMode.FillContainer,
  })

  const camera = new Camera()
  camera.zoom = options.zoom ?? 1
  if (options.cameraPos) camera.pos = options.cameraPos.clone()

  // `Camera._initialize` is how the engine hands a camera its screen and
  // builds the first transform. Its engine argument is only read for
  // `screen`, `isLoaded` and `clock.elapsed()` — identical in 0.32 and
  // 1.0.1 — so a stub keeps the camera maths real without an engine,
  // which would need a canvas, a GL context and a running clock.
  const engineStub = { screen, isLoaded: true, clock: { elapsed: () => 16 } }
  ;(camera as unknown as { _initialize(engine: unknown): void })._initialize(engineStub)
  if (options.cameraPos) camera.pos = options.cameraPos.clone()
  camera.updateTransform(camera.pos)
  screen.setCurrentCamera(camera)

  return {
    screen,
    camera,
    dispose: () => {
      screen.dispose()
      restoreGlobals()
    },
  }
}

/** Re-aim the camera and rebuild its transform, as a pan or zoom does. */
function aim(fixture: ScreenFixture, pos: Vector, zoom?: number): void {
  if (zoom !== undefined) fixture.camera.zoom = zoom
  fixture.camera.pos = pos.clone()
  fixture.camera.updateTransform(fixture.camera.pos)
}

function expectVecClose(actual: Vector, expected: Vector, epsilon = 1e-6): void {
  expect(Math.abs(actual.x - expected.x) < epsilon).toBe(true)
  expect(Math.abs(actual.y - expected.y) < epsilon).toBe(true)
}

/**
 * The composition `tile-editor.system.ts#toTileCoords` performs: world
 * position relative to the tilemap's origin, floored by tile size.
 */
function worldToTileCoords(world: Vector, origin: Vector): { x: number; y: number } {
  return worldToTile(world.x - origin.x, world.y - origin.y, TILE, TILE)
}

export default async () => {
  await describe('Screen coordinates (Excalibur version pin)', async () => {
    await describe('content area under DisplayMode.FillContainer', async () => {
      await it('is rooted at the canvas origin', async () => {
        const fixture = makeScreen()
        // The whole migration rests on this: our display mode does not
        // clip, so screen space and canvas space coincide and the
        // `contentArea` / `contentAreaOffset` re-rooting in 1.0 is a
        // no-op for us. If this ever becomes non-zero, all three
        // `screenToWorldCoordinates` callers need the offset applied by
        // hand and the tests below will say so first.
        expect(fixture.screen.contentArea.left).toBe(0)
        expect(fixture.screen.contentArea.top).toBe(0)
        expect(fixture.screen.contentArea.width).toBe(CANVAS_WIDTH)
        expect(fixture.screen.contentArea.height).toBe(CANVAS_HEIGHT)
        fixture.dispose()
      })

      await it('has a zero content-area offset', async () => {
        const fixture = makeScreen()
        // The other half of the same invariant, and the half 0.32 could
        // not state: `contentAreaOffset` only exists from 1.0. 1.0 made
        // the conversion pair symmetric — `screenToWorld` ADDS this
        // offset where `worldToScreen` subtracts it — so a non-zero
        // value would shift every pick by exactly that much.
        expect(fixture.screen.contentAreaOffset.x).toBe(0)
        expect(fixture.screen.contentAreaOffset.y).toBe(0)
        fixture.dispose()
      })

      await it('takes its resolution from the container', async () => {
        const fixture = makeScreen()
        expect(fixture.screen.resolution.width).toBe(CANVAS_WIDTH)
        expect(fixture.screen.resolution.height).toBe(CANVAS_HEIGHT)
        fixture.dispose()
      })
    })

    await describe('screenToWorldCoordinates', async () => {
      await it('maps the canvas centre to the camera position', async () => {
        const fixture = makeScreen()
        aim(fixture, vec(0, 0))
        expectVecClose(fixture.screen.screenToWorldCoordinates(vec(400, 300)), vec(0, 0))
        fixture.dispose()
      })

      await it('follows a pan one world unit per screen pixel at zoom 1', async () => {
        const fixture = makeScreen()
        aim(fixture, vec(1000, 800))
        expectVecClose(fixture.screen.screenToWorldCoordinates(vec(400, 300)), vec(1000, 800))
        expectVecClose(fixture.screen.screenToWorldCoordinates(vec(0, 0)), vec(600, 500))
        expectVecClose(fixture.screen.screenToWorldCoordinates(vec(800, 600)), vec(1400, 1100))
        fixture.dispose()
      })

      await it('divides screen distance by the zoom', async () => {
        const fixture = makeScreen()
        aim(fixture, vec(1000, 800), 2)
        // The centre is the fixed point of a zoom: it stays on the
        // camera whatever the scale.
        expectVecClose(fixture.screen.screenToWorldCoordinates(vec(400, 300)), vec(1000, 800))
        // 400 px left of centre at 2× is 200 world units.
        expectVecClose(fixture.screen.screenToWorldCoordinates(vec(0, 0)), vec(800, 650))

        aim(fixture, vec(1000, 800), 0.5)
        expectVecClose(fixture.screen.screenToWorldCoordinates(vec(0, 0)), vec(200, 200))
        fixture.dispose()
      })

      await it('round-trips through worldToScreenCoordinates', async () => {
        // 0.32 adds the content-area offset on the way in but never
        // subtracts it on the way out; 1.0 made the pair symmetric.
        // Under FillContainer the offset is zero either way, so this
        // holds on both — and breaks the moment that stops being true.
        const fixture = makeScreen()
        for (const [pos, zoom] of [
          [vec(0, 0), 1],
          [vec(1000, 800), 1],
          [vec(1000, 800), 2],
          [vec(-320, 96), 0.75],
        ] as const) {
          aim(fixture, pos, zoom)
          for (const screenPoint of [vec(0, 0), vec(400, 300), vec(800, 600), vec(123, 457)]) {
            const world = fixture.screen.screenToWorldCoordinates(screenPoint)
            expectVecClose(fixture.screen.worldToScreenCoordinates(world), screenPoint, 1e-4)
          }
        }
        fixture.dispose()
      })
    })

    await describe('screen → world → tile, as the editor resolves a click', async () => {
      await it('picks the tile the pointer is over at zoom 1', async () => {
        const fixture = makeScreen()
        const origin = vec(0, 0)
        // Camera on the map origin: the canvas centre sits on world
        // (0,0), so the top-left of the canvas is (-400, -300).
        aim(fixture, vec(0, 0))
        const hit = worldToTileCoords(fixture.screen.screenToWorldCoordinates(vec(400, 300)), origin)
        expect(hit.x).toBe(0)
        expect(hit.y).toBe(0)

        // One tile right and two down of the centre.
        const offset = worldToTileCoords(
          fixture.screen.screenToWorldCoordinates(vec(400 + TILE, 300 + 2 * TILE)),
          origin,
        )
        expect(offset.x).toBe(1)
        expect(offset.y).toBe(2)
        fixture.dispose()
      })

      await it('stays on the same tile across a pan and a zoom', async () => {
        const fixture = makeScreen()
        const origin = vec(0, 0)
        // Aim at the centre of tile (10, 7) and confirm the canvas
        // centre resolves to it at three different zooms — the pointer
        // picking must not drift with the scale.
        const target = vec(10 * TILE + TILE / 2, 7 * TILE + TILE / 2)
        for (const zoom of [0.5, 1, 2, 4]) {
          aim(fixture, target, zoom)
          const hit = worldToTileCoords(fixture.screen.screenToWorldCoordinates(vec(400, 300)), origin)
          expect(hit.x).toBe(10)
          expect(hit.y).toBe(7)
        }
        fixture.dispose()
      })

      await it('subtracts the tilemap origin, as toTileCoords does', async () => {
        const fixture = makeScreen()
        // A tilemap that does not start at the world origin: the plane
        // tilemaps carry a `pos`, and `findTileUnderPointer` subtracts
        // it before flooring.
        const origin = vec(64, 32)
        aim(fixture, vec(64, 32))
        const hit = worldToTileCoords(fixture.screen.screenToWorldCoordinates(vec(400, 300)), origin)
        expect(hit.x).toBe(0)
        expect(hit.y).toBe(0)

        aim(fixture, vec(64 + 3 * TILE, 32 + 5 * TILE))
        const moved = worldToTileCoords(fixture.screen.screenToWorldCoordinates(vec(400, 300)), origin)
        expect(moved.x).toBe(3)
        expect(moved.y).toBe(5)
        fixture.dispose()
      })
    })

    await describe('with a viewport inset (phone sheet at Half)', async () => {
      await it('centres the target in the uncovered part of the canvas', async () => {
        // The inset never touches `Screen`: `setViewportInset` only
        // moves the camera target. So the contract to pin is that a
        // point aimed at through `insetCameraTarget` lands at the centre
        // of the VISIBLE region — not at the canvas centre.
        const inset = normalizeViewportInset({ bottom: 200 })
        const visibleCentreY = (CANVAS_HEIGHT - inset.bottom) / 2

        for (const zoom of [0.5, 1, 2]) {
          const fixture = makeScreen()
          const target = vec(10 * TILE + TILE / 2, 7 * TILE + TILE / 2)
          const aimed = insetCameraTarget({ x: target.x, y: target.y }, inset, zoom)
          aim(fixture, vec(aimed.x, aimed.y), zoom)

          const world = fixture.screen.screenToWorldCoordinates(vec(CANVAS_WIDTH / 2, visibleCentreY))
          expectVecClose(world, target, 1e-4)

          const hit = worldToTileCoords(world, vec(0, 0))
          expect(hit.x).toBe(10)
          expect(hit.y).toBe(7)
          fixture.dispose()
        }
      })

      await it('leaves picking under the sheet consistent with the camera shift', async () => {
        // A pointer at the canvas centre while the sheet is up is BELOW
        // the visible centre, so it must resolve further down the map by
        // exactly half the inset in world units.
        const inset = normalizeViewportInset({ bottom: 200 })
        const fixture = makeScreen()
        const target = vec(0, 0)
        const zoom = 2
        const aimed = insetCameraTarget({ x: target.x, y: target.y }, inset, zoom)
        aim(fixture, vec(aimed.x, aimed.y), zoom)

        const atCanvasCentre = fixture.screen.screenToWorldCoordinates(vec(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2))
        expectVecClose(atCanvasCentre, vec(0, inset.bottom / (2 * zoom)), 1e-4)
        fixture.dispose()
      })

      await it('is a no-op when no inset is set', async () => {
        const inset = normalizeViewportInset({ bottom: 0 })
        expect(inset.bottom).toBe(0)

        const fixture = makeScreen()
        const target = vec(48, 96)
        const aimed = insetCameraTarget({ x: target.x, y: target.y }, inset, 1)
        aim(fixture, vec(aimed.x, aimed.y))
        expectVecClose(fixture.screen.screenToWorldCoordinates(vec(400, 300)), target)
        fixture.dispose()
      })
    })
  })
}
