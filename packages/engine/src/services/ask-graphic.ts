import { type ExcaliburGraphicsContext, Graphic } from 'excalibur'

/** One row's two pre-drawn looks and where it sits inside the stack (device pixels). */
export interface AskRowFrame {
  idle: HTMLCanvasElement | null
  highlighted: HTMLCanvasElement | null
  y: number
  width: number
  height: number
}

/** What the rows draw this frame; the owner updates it, the graphic only reads. */
export interface AskFrame {
  rows: AskRowFrame[]
  highlight: number
  width: number
  height: number
  /** Device pixels per logical pixel. */
  ratio: number
}

/** Draws the pre-rasterised rows: one quad per row per frame, no text work. */
export class AskGraphic extends Graphic {
  constructor(private readonly state: AskFrame) {
    super({ width: Math.max(1, state.width / state.ratio), height: Math.max(1, state.height / state.ratio) })
  }

  protected _drawImage(ctx: ExcaliburGraphicsContext, x: number, y: number): void {
    const s = this.state
    s.rows.forEach((row, i) => {
      const image = i === s.highlight ? row.highlighted : row.idle
      if (!image) return
      ctx.drawImage(
        image,
        0,
        0,
        row.width,
        row.height,
        x,
        y + row.y / s.ratio,
        row.width / s.ratio,
        row.height / s.ratio,
      )
    })
  }

  clone(): AskGraphic {
    return new AskGraphic(this.state)
  }
}
