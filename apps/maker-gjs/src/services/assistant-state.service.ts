import { DEFAULT_ASSISTANT_INFO } from '@pixelrpg/engine'

/** Plain JSON-safe snapshot of the assistant's editor-side state. */
export interface AssistantStateSnapshot {
  readonly present: boolean
  readonly name: string
  readonly color: string
  readonly paused: boolean
}

/**
 * Single source of truth for the AI assistant's editor-side state:
 * presence, display identity (name/colour) and the user's pause switch.
 *
 * Owned by the `ApplicationWindow` (one instance per window), because the
 * engine is disposed/recreated on every scene-editor exit/entry — any
 * per-engine assistant field is a cache that resets to defaults, never an
 * owner. The window re-pushes this state into each freshly created engine
 * (see `engine-state-sync.ts`), and the `win.toggle-assistant-paused`
 * GAction's state is the GTK-binding mirror updated in the same handler
 * that writes `paused` here (every read goes through this service).
 *
 * See docs/concepts/ai-collaborator.md § "State ownership & engine
 * recreation".
 */
export class AssistantStateService {
  private _present = false
  private _name: string = DEFAULT_ASSISTANT_INFO.displayName
  private _color: string = DEFAULT_ASSISTANT_INFO.color
  private _paused = false

  /** Whether the assistant participant is currently present. */
  get present(): boolean {
    return this._present
  }

  /** The assistant's display name. */
  get name(): string {
    return this._name
  }

  /** The assistant's display colour (CSS hex). */
  get color(): string {
    return this._color
  }

  /** Whether the USER has paused the assistant (human-only switch). */
  get paused(): boolean {
    return this._paused
  }

  /** Mark the assistant present/absent. Returns `true` if the value changed. */
  setPresent(present: boolean): boolean {
    if (this._present === present) return false
    this._present = present
    return true
  }

  /** Set the assistant's display identity (does not change presence). */
  setInfo(name: string, color: string): void {
    this._name = name
    this._color = color
  }

  /** Set the user's pause switch. Returns `true` if the value changed. */
  setPaused(paused: boolean): boolean {
    if (this._paused === paused) return false
    this._paused = paused
    return true
  }

  /** Immutable snapshot for re-pushing into a fresh engine / status output. */
  snapshot(): AssistantStateSnapshot {
    return { present: this._present, name: this._name, color: this._color, paused: this._paused }
  }
}
