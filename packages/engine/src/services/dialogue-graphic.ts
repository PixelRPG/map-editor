import { type ExcaliburGraphicsContext, Graphic } from 'excalibur'

/** What the box draws this frame; the owner updates it, the graphic only reads. */
export interface DialogueFrame {
  /** The box, tab and speaker name, rasterised once per open box. */
  frame: HTMLCanvasElement | null
  /** The current page's lines, rasterised once per page (transparent background). */
  text: HTMLCanvasElement | null
  /** Device-pixel size of both images. */
  width: number
  height: number
  /** Device pixels from the top of the images to the first text line, and one line's height. */
  textTop: number
  lineHeight: number
  /** Device-pixel x where the text starts inside the images. */
  textLeft: number
  /** Visible width of each line, in device pixels (the typewriter's clip). */
  clip: readonly number[]
  /** Device pixels per logical pixel. */
  ratio: number
}

/**
 * Draws a pre-rasterised text box. Per frame: one quad for the frame and
 * one per visible line — the typewriter clips the line image, it never
 * re-lays-out or re-draws text.
 */
export class DialogueGraphic extends Graphic {
  constructor(private readonly state: DialogueFrame) {
    super({ width: Math.max(1, state.width / state.ratio), height: Math.max(1, state.height / state.ratio) })
  }

  protected _drawImage(ctx: ExcaliburGraphicsContext, x: number, y: number): void {
    const s = this.state
    if (!s.frame) return
    const dw = s.width / s.ratio
    const dh = s.height / s.ratio
    ctx.drawImage(s.frame, 0, 0, s.width, s.height, x, y, dw, dh)
    if (!s.text) return
    for (let i = 0; i < s.clip.length; i++) {
      const w = Math.min(s.clip[i], s.width - s.textLeft)
      if (w <= 0) continue
      const sy = s.textTop + i * s.lineHeight
      ctx.drawImage(
        s.text,
        s.textLeft,
        sy,
        w,
        s.lineHeight,
        x + s.textLeft / s.ratio,
        y + sy / s.ratio,
        w / s.ratio,
        s.lineHeight / s.ratio,
      )
    }
  }

  clone(): DialogueGraphic {
    return new DialogueGraphic(this.state)
  }
}
