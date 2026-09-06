import {
  Color,
  type Entity,
  Polygon,
  type Query,
  type Scene,
  ScreenElement,
  System,
  SystemType,
  vec,
  type Vector,
  type World,
} from 'excalibur'
import { HudHeartComponent } from '../components/hud-heart.component.ts'
import { RuntimeModeComponent } from '../components/runtime-mode.component.ts'
import { StatsRuntimeComponent } from '../components/stats-runtime.component.ts'
import { combatSession, findPlayerActor } from '../utils/combat.ts'
import { SessionState } from '../utils/session-state.ts'

type HeartQuery = Query<typeof HudHeartComponent>

/** Heart size and spacing in screen pixels. */
const HEART_SIZE = 22
const HEART_GAP = 6
const MARGIN = 12

const FULL = Color.fromHex('#e0335f')
const EMPTY = Color.fromHex('#3a2027')
const OUTLINE = Color.fromHex('#1b1016')

/**
 * The heart row: one heart per point of the hero's live `maxHp`, filled
 * up to their current `hp`.
 *
 * **Excalibur screen-space, not GTK.** The HUD is drawn as
 * {@link ScreenElement}s inside the same canvas the game renders to, so a
 * Full Run window and a browser export get it for free. A GTK overlay
 * would exist only in the maker, and the first person to export their
 * game would lose their health bar without being told why.
 *
 * Hearts are rebuilt only when `maxHp` changes (a level-up, a different
 * hero) and merely recoloured otherwise, so the common frame allocates
 * nothing. Visible only in runtime mode — a heart row floating over the
 * map while editing would be chrome pretending to be a game.
 */
export class HudSystem extends System {
  public readonly systemType = SystemType.Update

  private scene: Scene | null = null
  private heartQuery: HeartQuery | null = null

  public initialize(world: World, scene: Scene): void {
    if (super.initialize) super.initialize(world, scene)
    this.scene = scene
    this.heartQuery = world.queryManager.createQuery([HudHeartComponent])
  }

  public update(_elapsedMs: number): void {
    const scene = this.scene
    if (!scene || !this.heartQuery) return

    const inRuntime = SessionState.get(scene, RuntimeModeComponent) !== null
    const stats = inRuntime ? (findPlayerActor(scene)?.get(StatsRuntimeComponent) ?? null) : null

    if (!stats) {
      for (const heart of this.heartQuery.entities) hide(heart)
      return
    }

    const session = combatSession(scene)
    if (session.renderedMaxHp !== stats.maxHp) {
      this.rebuildRow(scene, stats.maxHp)
      session.renderedMaxHp = stats.maxHp
    }

    for (const heart of this.heartQuery.entities) {
      const index = heart.get(HudHeartComponent)?.index ?? 0
      const element = heart as ScreenElement
      element.graphics.visible = true
      element.graphics.use(index < stats.hp ? fullHeart() : emptyHeart())
    }
  }

  /** Drop the current row and lay out `count` fresh hearts. */
  private rebuildRow(scene: Scene, count: number): void {
    for (const heart of this.heartQuery?.entities ?? []) scene.world.entityManager.removeEntity(heart)
    for (let index = 0; index < count; index += 1) {
      const element = new ScreenElement({
        name: `hud-heart-${index}`,
        x: MARGIN + index * (HEART_SIZE + HEART_GAP),
        y: MARGIN,
        width: HEART_SIZE,
        height: HEART_SIZE,
      })
      element.addComponent(new HudHeartComponent(index))
      element.graphics.use(fullHeart())
      scene.add(element)
    }
  }
}

/** Hide one heart without destroying it — the row survives a pause. */
function hide(heart: Entity): void {
  const element = heart as ScreenElement
  if (element.graphics) element.graphics.visible = false
}

/**
 * The two heart graphics, built on first use and shared by every heart in
 * the row.
 *
 * Lazily rather than at module load because constructing a {@link Polygon}
 * rasterises it, which needs a canvas — and the engine is imported in
 * places that have none (a headless unit run, a validation pass). Shared
 * rather than per-heart because a raster is immutable: twenty hearts
 * pointing at two graphics is twenty pointers, and rebuilding them per
 * frame would be a canvas allocation in the render loop.
 */
let fullGraphic: Polygon | null = null
let emptyGraphic: Polygon | null = null

function fullHeart(): Polygon {
  fullGraphic ??= new Polygon({ points: HEART_POINTS, color: FULL, strokeColor: OUTLINE, lineWidth: 1 })
  return fullGraphic
}

function emptyHeart(): Polygon {
  emptyGraphic ??= new Polygon({ points: HEART_POINTS, color: EMPTY, strokeColor: OUTLINE, lineWidth: 1 })
  return emptyGraphic
}

/**
 * The heart outline, sampled from the classic cardioid
 * `x = 16sin³t`, `y = 13cos t − 5cos2t − 2cos3t − cos4t`, scaled to
 * {@link HEART_SIZE} and flipped because screen y grows downward.
 *
 * Built once at module load: the shape never changes, and re-sampling it
 * per frame would be trigonometry in the render loop for no reason.
 */
const HEART_POINTS: Vector[] = buildHeartPoints(HEART_SIZE)

function buildHeartPoints(size: number): Vector[] {
  const steps = 28
  const points: Vector[] = []
  for (let step = 0; step < steps; step += 1) {
    const t = (step / steps) * Math.PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    points.push(vec((x / 34) * size, (-y / 30) * size))
  }
  return points
}
