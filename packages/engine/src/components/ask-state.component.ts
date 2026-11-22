import { Component } from 'excalibur'
import { type AskData, newAskData } from '../services/ask-state.ts'

/**
 * The question that is open right now — data on the session singleton,
 * written only by `AskSystem`. Runtime and local, like
 * {@link DialogueStateComponent}: each player answers for themselves, so
 * it never travels over the wire.
 */
export class AskStateComponent extends Component implements AskData {
  public highlight: number
  public confirmWasHeld: boolean
  public cancelWasHeld: boolean
  public menuWas: number
  public readonly count: number
  public readonly cancelIndex: number | null

  constructor(
    public readonly ids: readonly string[],
    public readonly labels: readonly string[],
    cancelId: string | undefined,
  ) {
    super()
    const index = cancelId === undefined ? -1 : ids.indexOf(cancelId)
    const fresh = newAskData(ids.length, index < 0 ? null : index)
    this.count = fresh.count
    this.cancelIndex = fresh.cancelIndex
    this.highlight = fresh.highlight
    this.confirmWasHeld = fresh.confirmWasHeld
    this.cancelWasHeld = fresh.cancelWasHeld
    this.menuWas = fresh.menuWas
  }
}
