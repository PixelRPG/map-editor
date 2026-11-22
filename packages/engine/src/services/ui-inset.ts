import type { Engine as ExcaliburEngine } from 'excalibur'

/**
 * Canvas edges that host chrome draws over the game view — the phone's
 * on-screen controls and bottom sheet. Unlike {@link ViewportInset} this
 * never moves the camera: it only keeps in-game UI (the dialogue box)
 * clear of what covers the picture. CSS pixels, as the host measures them.
 */
export interface UiInset {
  readonly bottom: number
}

export const EMPTY_UI_INSET: UiInset = { bottom: 0 }

const insets = new WeakMap<ExcaliburEngine, UiInset>()

/** Reject NaN / negative / non-finite values at the boundary. */
export function normalizeUiInset(inset: Partial<UiInset> | null | undefined): UiInset {
  const bottom = inset?.bottom
  if (typeof bottom !== 'number' || !Number.isFinite(bottom) || bottom <= 0) return EMPTY_UI_INSET
  return { bottom }
}

export function setUiInset(engine: ExcaliburEngine, inset: Partial<UiInset> | null | undefined): void {
  insets.set(engine, normalizeUiInset(inset))
}

export function getUiInset(engine: ExcaliburEngine | undefined | null): UiInset {
  return (engine && insets.get(engine)) || EMPTY_UI_INSET
}
