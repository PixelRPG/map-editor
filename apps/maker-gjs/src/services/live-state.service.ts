import type { FlagValue } from '@pixelrpg/engine'

/**
 * What a test run currently remembers, as far as the window's panels care.
 *
 * `placementStates` is the resolved state id per placement id (`null` = base) (the
 * "active now" badge of the state cards reads it); a source that does not
 * report it leaves it out.
 */
export interface LiveState {
  readonly flags: Readonly<Record<string, FlagValue>>
  readonly thingFlags: Readonly<Record<string, Readonly<Record<string, FlagValue>>>>
  readonly placementStates?: Readonly<Record<string, string | null>>
}

/**
 * The ONE place the window reads a running game's state, so every panel
 * that shows it (the Game memory page, the state cards' "active now"
 * badge) shares a snapshot instead of each polling the engine.
 *
 * It is event-driven: the owner calls {@link refresh} when something the
 * run remembers changed (a flag event) and {@link start} / {@link stop}
 * around a run. Outside a run it holds nothing and every call but
 * {@link start} does nothing, so an editing session pays nothing for it.
 */
export class LiveStateService {
  private _active = false
  private _snapshot: LiveState | null = null
  private readonly _listeners = new Set<(state: LiveState | null) => void>()

  constructor(private readonly _read: () => LiveState | null) {}

  /** Whether a run is on. */
  get active(): boolean {
    return this._active
  }

  /** The state as of the last refresh; `null` outside a run. */
  get snapshot(): LiveState | null {
    return this._snapshot
  }

  /** A run began (or began again): read the state and tell the listeners. */
  start(): void {
    this._active = true
    this._set(this._read())
  }

  /** The run ended: forget the state and tell the listeners. */
  stop(): void {
    this._active = false
    this._set(null)
  }

  /** Something the run remembers changed. A no-op outside a run. */
  refresh(): void {
    if (this._active) this._set(this._read())
  }

  /** Listen for a new snapshot (`null` once the run ends). Returns the unsubscribe. */
  onChanged(listener: (state: LiveState | null) => void): () => void {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  private _set(state: LiveState | null): void {
    this._snapshot = state
    for (const listener of [...this._listeners]) listener(state)
  }
}
