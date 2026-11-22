import { type EventEmitter, type Scene, ScreenElement, System, SystemType, vec, type World } from 'excalibur'
import { DialogueStateComponent } from '../components/dialogue-state.component.ts'
import { InputSourceComponent } from '../components/input-source.component.ts'
import { type DialogueFrame, DialogueGraphic } from '../services/dialogue-graphic.ts'
import {
  DIALOGUE_LINE_HEIGHT,
  DIALOGUE_PADDING_X,
  DIALOGUE_PADDING_Y,
  DIALOGUE_TAB_HEIGHT,
  type DialogueGeometry,
  dialogueGeometry,
  revealWidths,
} from '../services/dialogue-layout.ts'
import { rasterFrame, rasterPage } from '../services/dialogue-raster.ts'
import {
  advanceReveal,
  confirmDialogue,
  type DialogueData,
  takeConfirm,
  visibleChars,
} from '../services/dialogue-state.ts'
import { getUiInset } from '../services/ui-inset.ts'
import { createAdvanceFn } from '../services/font-metrics.ts'
import { FUSION_PIXEL_12_METRICS } from '../services/fusion-pixel-12-metrics.ts'
import { layoutText } from '../services/text-layout.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { SubscriptionScope } from '../utils/subscription-scope.ts'

const advance = createAdvanceFn(FUSION_PIXEL_12_METRICS)

/**
 * What a scene's open box owns that is not data: the screen element and
 * the rasters. Held outside the component (which is data only) and
 * dropped with the scene.
 */
interface BoxResource {
  readonly element: ScreenElement
  readonly frame: DialogueFrame
  geometry: DialogueGeometry
  pageRaster: Map<number, HTMLCanvasElement | null>
  speaker: string | null
}

const resources = new WeakMap<Scene, BoxResource>()

/**
 * The in-game text box for `show-text`. Opens on `SHOW_TEXT_REQUESTED`,
 * reveals the current page like a typewriter, and emits
 * `DIALOGUE_CLOSED` when the last page is dismissed — the event the
 * sequencer's `show-text` step waits for.
 *
 * Drawn as a {@link ScreenElement} in the game canvas, like the HUD, so a
 * browser export gets it too. Each page is laid out and rasterised ONCE
 * at a whole number of device pixels per UI pixel (the pixel font stays
 * crisp at any display scale); the typewriter only clips that image.
 *
 * Confirm = `InputSourceComponent.confirmHeld` (Enter, Space, touch A,
 * controller) or a tap anywhere on the view: the first finishes the
 * page's reveal, the next advances or closes.
 */
export class DialogueSystem extends System {
  public readonly systemType = SystemType.Update

  private readonly subscriptions = new SubscriptionScope()
  private scene: Scene | null = null

  /**
   * @param reducedMotion when it answers `true` a page appears at once
   * instead of typing out.
   */
  constructor(
    private readonly events: EventEmitter<EngineEventMap>,
    private readonly reducedMotion: () => boolean = () => false,
  ) {
    super()
  }

  public onInitialize(world: World, scene: Scene): void {
    if (super.onInitialize) super.onInitialize(world, scene)
    this.scene = scene
    this.subscriptions.add(
      this.events.on(EngineEvent.SHOW_TEXT_REQUESTED, (p) => this.open(p.text, p.speaker ?? null, p.hold ?? false)),
    )
    this.subscriptions.add(
      this.events.on(EngineEvent.ASK_ANSWERED, () => {
        if (SessionState.get(scene, DialogueStateComponent)?.hold) this.teardown(scene)
      }),
    )
    this.subscriptions.add(
      this.events.on(EngineEvent.POINTER_TAP, () => {
        const state = scene && SessionState.get(scene, DialogueStateComponent)
        if (state) state.tapQueued = true
      }),
    )
  }

  public dispose(): void {
    this.subscriptions.closeAll()
    if (this.scene) this.teardown(this.scene)
  }

  public onUpdate(elapsedMs: number): void {
    const scene = this.scene
    const state = scene && SessionState.get(scene, DialogueStateComponent)
    const box = scene && resources.get(scene)
    if (!scene || !state || !box) return

    const geometry = this.measure(scene)
    if (geometry && !sameGeometry(geometry, box.geometry)) this.rebuild(scene, box, state, geometry)

    const data = state as unknown as DialogueData
    const held = SessionState.get(scene, InputSourceComponent)?.confirmHeld ?? false
    if (takeConfirm(data, held)) {
      const result = confirmDialogue(data)
      // A held box (an `ask` prompt) stays; the answer closes it.
      if (result === 'closed' && !state.hold) {
        this.close(scene)
        return
      }
    }
    advanceReveal(data, elapsedMs, this.reducedMotion())
    this.present(box, state)
  }

  private open(text: string, speaker: string | null, hold = false): void {
    const scene = this.scene
    if (!scene) return
    this.teardown(scene)
    const geometry = this.measure(scene)
    const pages = geometry
      ? layoutText(text, { maxWidth: geometry.textWidth, advance }).map((p) => p.lines)
      : layoutText(text, { maxWidth: 296, advance }).map((p) => p.lines)
    // A held prompt with no text still needs its box: the rows hang off it.
    if (hold && pages.length === 0) pages.push([''])
    if (pages.length === 0 || !geometry) {
      this.events.emit(EngineEvent.DIALOGUE_CLOSED, {})
      return
    }
    const state = new DialogueStateComponent(pages, speaker, hold)
    SessionState.set(scene, state)

    const ratio = this.pixelRatio(scene)
    const frame: DialogueFrame = {
      frame: null,
      text: null,
      width: geometry.boxWidth * geometry.k,
      height: (geometry.boxHeight + DIALOGUE_TAB_HEIGHT) * geometry.k,
      textTop: (DIALOGUE_TAB_HEIGHT + DIALOGUE_PADDING_Y) * geometry.k,
      lineHeight: DIALOGUE_LINE_HEIGHT * geometry.k,
      textLeft: DIALOGUE_PADDING_X * geometry.k,
      clip: [],
      ratio,
    }
    const element = new ScreenElement({ name: 'dialogue-box', x: 0, y: 0, z: 1000, anchor: vec(0, 0) })
    element.graphics.use(new DialogueGraphic(frame))
    scene.add(element)
    const box: BoxResource = { element, frame, geometry, pageRaster: new Map(), speaker }
    resources.set(scene, box)
    this.rebuild(scene, box, state, geometry)
    this.present(box, state)
  }

  /** (Re)draw the frame and drop cached pages — the surface changed. */
  private rebuild(scene: Scene, box: BoxResource, state: DialogueStateComponent, geometry: DialogueGeometry): void {
    box.geometry = geometry
    box.pageRaster.clear()
    const ratio = this.pixelRatio(scene)
    box.frame.ratio = ratio
    box.frame.width = geometry.boxWidth * geometry.k
    box.frame.height = (geometry.boxHeight + DIALOGUE_TAB_HEIGHT) * geometry.k
    box.frame.textTop = (DIALOGUE_TAB_HEIGHT + DIALOGUE_PADDING_Y) * geometry.k
    box.frame.lineHeight = DIALOGUE_LINE_HEIGHT * geometry.k
    box.frame.textLeft = DIALOGUE_PADDING_X * geometry.k
    box.frame.frame = rasterFrame(geometry, box.speaker, advance)
    box.element.graphics.use(new DialogueGraphic(box.frame))
    box.element.pos = vec(geometry.originX / ratio, geometry.originY / ratio)
    void state
  }

  /** Point the box at the current page and clip it to what is revealed. */
  private present(box: BoxResource, state: DialogueStateComponent): void {
    if (!box.pageRaster.has(state.page)) {
      box.pageRaster.set(state.page, rasterPage(box.geometry, state.pages[state.page] ?? []))
    }
    box.frame.text = box.pageRaster.get(state.page) ?? null
    const widths = revealWidths(state.pages[state.page] ?? [], visibleChars(state as unknown as DialogueData), advance)
    box.frame.clip = widths.map((w) => w * box.geometry.k)
  }

  private close(scene: Scene): void {
    this.teardown(scene)
    this.events.emit(EngineEvent.DIALOGUE_CLOSED, {})
  }

  private teardown(scene: Scene): void {
    const box = resources.get(scene)
    if (box) {
      box.element.kill()
      resources.delete(scene)
    }
    SessionState.unset(scene, DialogueStateComponent)
  }

  private pixelRatio(scene: Scene): number {
    const ratio = scene.engine?.screen?.pixelRatio
    return ratio > 0 && Number.isFinite(ratio) ? ratio : 1
  }

  private measure(scene: Scene): DialogueGeometry | null {
    const screen = scene.engine?.screen
    if (!screen) return null
    const ratio = this.pixelRatio(scene)
    const viewport = {
      width: Math.round(screen.resolution.width * ratio),
      height: Math.round(screen.resolution.height * ratio),
    }
    if (!(viewport.width > 0) || !(viewport.height > 0)) return null
    return dialogueGeometry(viewport, getUiInset(scene.engine).bottom * ratio)
  }
}

function sameGeometry(a: DialogueGeometry, b: DialogueGeometry): boolean {
  return a.k === b.k && a.boxWidth === b.boxWidth && a.originX === b.originX && a.originY === b.originY
}
