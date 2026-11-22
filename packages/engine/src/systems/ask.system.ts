import { type EventEmitter, type Scene, ScreenElement, System, SystemType, vec, type World } from 'excalibur'
import { AskStateComponent } from '../components/ask-state.component.ts'
import { DialogueStateComponent } from '../components/dialogue-state.component.ts'
import { InputSourceComponent } from '../components/input-source.component.ts'
import { type AskFrame, AskGraphic } from '../services/ask-graphic.ts'
import { type AskLayout, askLayout, hitRow } from '../services/ask-layout.ts'
import { rasterAskRow } from '../services/ask-raster.ts'
import { optionsOpen, stepAsk } from '../services/ask-state.ts'
import { type DialogueGeometry, dialogueGeometry } from '../services/dialogue-layout.ts'
import { loadPixelFont, pixelAdvance as advance } from '../services/pixel-font.ts'
import { getUiInset } from '../services/ui-inset.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { SessionState } from '../utils/session-state.ts'
import { SubscriptionScope } from '../utils/subscription-scope.ts'

interface RowsResource {
  readonly element: ScreenElement
  readonly frame: AskFrame
  geometry: DialogueGeometry | null
  layout: AskLayout | null
  /** A tap that landed on a row, waiting for the next tick. */
  tap: { x: number; y: number } | null
}

const resources = new WeakMap<Scene, RowsResource>()

/**
 * The answers of an `ask` step. The prompt rides the ordinary text box
 * (`DialogueSystem`, held open past its last page); this system draws the
 * rows above it and turns input into a pick.
 *
 * Rows appear once the prompt is fully shown. Up/down move the highlight,
 * confirm picks it, a tap on a row picks that row, cancel picks the
 * authored cancel option when there is one. There is no timer.
 */
export class AskSystem extends System {
  public readonly systemType = SystemType.Update

  private readonly subscriptions = new SubscriptionScope()
  private scene: Scene | null = null

  constructor(private readonly events: EventEmitter<EngineEventMap>) {
    super()
  }

  public onInitialize(world: World, scene: Scene): void {
    if (super.onInitialize) super.onInitialize(world, scene)
    this.scene = scene
    void loadPixelFont()
    this.subscriptions.add(
      this.events.on(EngineEvent.ASK_REQUESTED, (p) => this.open(p.prompt, p.options, p.cancelId)),
      this.events.on(EngineEvent.POINTER_TAP, ({ screenPos }) => {
        const res = resources.get(scene)
        if (res) res.tap = { x: screenPos.x, y: screenPos.y }
      }),
    )
  }

  public dispose(): void {
    this.subscriptions.closeAll()
    if (this.scene) this.teardown(this.scene)
  }

  public onUpdate(): void {
    const scene = this.scene
    const state = scene && SessionState.get(scene, AskStateComponent)
    const res = scene && resources.get(scene)
    const box = scene && SessionState.get(scene, DialogueStateComponent)
    if (!scene || !state || !res || !box) return

    const geometry = this.measure(scene)
    if (geometry && !sameGeometry(geometry, res.geometry)) this.rebuild(scene, state, res, geometry)

    const open = optionsOpen(box)
    res.element.graphics.isVisible = open
    const tap = res.tap
    res.tap = null

    const input = SessionState.get(scene, InputSourceComponent)
    const held = input?.confirmHeld ?? false
    const cancel = input?.cancelHeld ?? false
    if (!open) {
      // The press that finished the prompt must be released before it can pick.
      state.confirmWasHeld = held
      state.cancelWasHeld = cancel
      state.menuWas = Math.sign(input?.menuY ?? 0)
      return
    }

    let picked: number | null = null
    if (tap && res.layout) {
      const ratio = this.pixelRatio(scene)
      const row = hitRow(res.layout, tap.x * ratio, tap.y * ratio)
      if (row >= 0) picked = row
    }
    const stepped = stepAsk(state, { menuY: input?.menuY ?? 0, confirmHeld: held, cancelHeld: cancel })
    if (picked === null) picked = stepped
    res.frame.highlight = picked ?? state.highlight
    if (picked === null) return

    const optionId = state.ids[picked]
    this.teardown(scene)
    this.events.emit(EngineEvent.ASK_ANSWERED, { optionId })
  }

  private open(prompt: string, options: { id: string; label: string }[], cancelId: string | undefined): void {
    const scene = this.scene
    if (!scene) return
    this.teardown(scene)
    const state = new AskStateComponent(
      options.map((o) => o.id),
      options.map((o) => o.label),
      cancelId,
    )
    SessionState.set(scene, state)
    const frame: AskFrame = { rows: [], highlight: 0, width: 1, height: 1, ratio: this.pixelRatio(scene) }
    const element = new ScreenElement({ name: 'ask-rows', x: 0, y: 0, z: 1001, anchor: vec(0, 0) })
    element.graphics.isVisible = false
    element.graphics.use(new AskGraphic(frame))
    scene.add(element)
    resources.set(scene, { element, frame, geometry: null, layout: null, tap: null })
    this.events.emit(EngineEvent.SHOW_TEXT_REQUESTED, { text: prompt, hold: true })
  }

  /** Lay the rows out for the current surface and rasterise each look once. */
  private rebuild(scene: Scene, state: AskStateComponent, res: RowsResource, geometry: DialogueGeometry): void {
    const ratio = this.pixelRatio(scene)
    const layout = askLayout(geometry, state.labels, advance)
    res.geometry = geometry
    res.layout = layout
    res.frame.ratio = ratio
    res.frame.width = layout.width
    res.frame.height = layout.height
    res.frame.rows = layout.rows.map((row) => ({
      idle: rasterAskRow(row, geometry.k, false),
      highlighted: rasterAskRow(row, geometry.k, true),
      y: row.y - layout.y,
      width: row.width,
      height: row.height,
    }))
    res.element.graphics.use(new AskGraphic(res.frame))
    res.element.pos = vec(layout.x / ratio, layout.y / ratio)
  }

  private teardown(scene: Scene): void {
    const res = resources.get(scene)
    if (res) {
      res.element.kill()
      resources.delete(scene)
    }
    SessionState.unset(scene, AskStateComponent)
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

function sameGeometry(a: DialogueGeometry, b: DialogueGeometry | null): boolean {
  return !!b && a.k === b.k && a.boxWidth === b.boxWidth && a.originX === b.originX && a.originY === b.originY
}
