/**
 * What a system owes the scene it is removed from.
 *
 * `ProjectLoader.loadMap` builds a fresh `MapScene` per map and never
 * returns to the old one, but the emitters our systems subscribe to in
 * `onInitialize` — the engine-wide event bus and
 * `engine.input.pointers.primary` — belong to the ENGINE and outlive
 * every scene. A handler left behind therefore does not go quiet: it
 * still reads `engine.currentScene.camera`, so it steers whatever map
 * is showing now. The visible symptom is arithmetic: after visiting N
 * maps, one drag pans N times and the room scrolls N× too fast.
 *
 * Excalibur 1.0 gives us the hook that ends it — `System.dispose()`,
 * called by `SystemManager.removeSystem` for every initialized system —
 * and `retireScene` is what calls `world.clearSystems()` on the map we
 * leave. These cases pin the chain from both ends: the fan-out really
 * happens (so the test can fail), and disposal really stops it.
 *
 * `CameraControlSystem` stands in for all twelve subscribing systems:
 * it is the one whose duplicate handler is measurable in a single
 * number.
 */

import { describe, expect, it } from '@gjsify/unit'
import { type Engine, EventEmitter, type Scene, System, SystemType, World } from 'excalibur'

import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { CameraControlSystem } from './camera-control.system.ts'

interface Camera {
  x: number
  y: number
  zoom: number
}

/** The one pointer event `CameraControlSystem` takes from the raw pointer. */
type PointerBus = EventEmitter<{ wheel: { deltaY: number } }>

interface Harness {
  /** The engine-wide bus — one instance for the whole session. */
  events: EventEmitter<EngineEventMap>
  /** `engine.input.pointers.primary` — also one for the whole session. */
  pointer: PointerBus
  /** `engine.currentScene.camera`: whatever map is showing right now. */
  camera: Camera
  /** Build a map scene with a camera control system on it, initialized. */
  openMap(): World
}

/**
 * An engine reduced to the three things `CameraControlSystem` reads:
 * the primary pointer, the current scene's camera, and the scene's
 * entities (where `SessionState` looks for the drag intent). The
 * pointer and the camera are shared across every map the harness
 * opens, which is precisely the property that makes a leaked
 * subscription visible.
 *
 * `entities: []` means "no session singleton", which `SessionState`
 * reads as no `DragIntentComponent` and the system reads as "pan" —
 * the default this suite measures.
 */
function createHarness(): Harness {
  const events = new EventEmitter<EngineEventMap>()
  const pointer: PointerBus = new EventEmitter()
  const camera: Camera = { x: 0, y: 0, zoom: 1 }
  const engine = {
    currentScene: { camera, entities: [] },
    input: { pointers: { primary: pointer } },
  } as unknown as Engine

  return {
    events,
    pointer,
    camera,
    openMap() {
      // `new World(scene)` registers no systems of its own, unlike
      // `new Scene()`, so nothing here needs a screen or a renderer.
      const world = new World({ engine } as unknown as Scene)
      world.add(new CameraControlSystem(events))
      world.systemManager.initialize()
      return world
    },
  }
}

function drag(harness: Harness, deltaX: number, deltaY: number): void {
  harness.events.emit(EngineEvent.POINTER_DRAG_MOVE, {
    screenPos: { x: 0, y: 0 },
    deltaX,
    deltaY,
  })
}

/** Records the lifecycle calls `SystemManager` makes, and nothing else. */
class SpySystem extends System {
  public readonly systemType = SystemType.Update
  public initializeCount = 0
  public disposeCount = 0

  public onInitialize(): void {
    this.initializeCount++
  }

  public dispose(): void {
    this.disposeCount++
  }

  public onUpdate(_elapsed: number): void {
    // Nothing to do — this system exists to be added and removed.
  }
}

export default async function () {
  await describe('system lifetime across a map switch', async () => {
    await it('fans a single drag out to every map still subscribed', async () => {
      // The control: without this, a passing suite would prove nothing,
      // because a system that never subscribed also never double-pans.
      const harness = createHarness()
      harness.openMap()
      harness.openMap()

      drag(harness, 10, 4)

      expect(harness.camera.x).toBe(-20)
      expect(harness.camera.y).toBe(-8)
    })

    await it('pans exactly once after the map we left is cleared', async () => {
      const harness = createHarness()
      const firstMap = harness.openMap()
      harness.openMap()

      // What `retireScene` does to the outgoing scene.
      firstMap.clearSystems()
      drag(harness, 10, 4)

      expect(harness.camera.x).toBe(-10)
      expect(harness.camera.y).toBe(-4)
    })

    await it('takes the retired map off the pointer too, not just the bus', async () => {
      // Pan rides the engine bus, zoom rides `pointer.on('wheel')`.
      // They are separate emitters, so each needs its own release.
      const harness = createHarness()
      const firstMap = harness.openMap()
      harness.openMap()

      firstMap.clearSystems()
      harness.pointer.emit('wheel', { deltaY: -1 })

      expect(harness.camera.zoom).toBe(1 + EDITOR_CONSTANTS.ZOOM_STEP)
    })

    await it('leaves nothing subscribed once every map is retired', async () => {
      const harness = createHarness()
      const firstMap = harness.openMap()
      const secondMap = harness.openMap()

      firstMap.clearSystems()
      secondMap.clearSystems()
      drag(harness, 10, 4)
      harness.pointer.emit('wheel', { deltaY: -1 })

      expect(harness.camera.x).toBe(0)
      expect(harness.camera.y).toBe(0)
      expect(harness.camera.zoom).toBe(1)
    })
  })

  await describe('World.clearSystems', async () => {
    await it('disposes a system that was initialized', async () => {
      const world = new World({} as unknown as Scene)
      const system = new SpySystem()
      world.add(system)
      world.systemManager.initialize()

      expect(system.initializeCount).toBe(1)

      world.clearSystems()

      // The contract the twelve `dispose()` overrides rely on:
      // `SystemManager.removeSystem` calls it, `clear()` removes all.
      expect(system.disposeCount).toBe(1)
    })

    await it('does not dispose a system that never initialized', async () => {
      // A scene built but never activated holds no subscriptions, so
      // disposing it would release handles that were never taken.
      const world = new World({} as unknown as Scene)
      const system = new SpySystem()
      world.add(system)

      world.clearSystems()

      expect(system.initializeCount).toBe(0)
      expect(system.disposeCount).toBe(0)
    })
  })
}
