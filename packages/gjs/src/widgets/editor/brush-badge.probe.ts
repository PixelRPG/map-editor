import type Gdk from '@girs/gdk-4.0'
import type { EditorTool, LayerPlane } from '@pixelrpg/engine'

import { brushBadgeProbes } from './brush-badge.geometry.ts'
import { BrushBadge } from './brush-badge.ts'
import { type Rgb, renderSquare } from './pixel-probe.ts'

/**
 * Display-backed half of the badge's "three facts, one square" claim:
 * render a real `PixelRpgBrushBadge` and read the probe pixels of
 * `brush-badge.geometry.ts` back. `brush-badge.geometry.spec.ts` proves
 * the probes cannot collide on paper; this proves the rendered pixels
 * carry ring, disc and picture where the paper says. GTK-only —
 * `brush-badge.probe.spec.ts` loads this module lazily so the node test
 * bundle never evaluates it. The window pumping and pixel download live
 * in `pixel-probe.ts`, shared with the depth glyph.
 */

/** The element each probe pixel lands on. */
export type BadgeProbeKey = 'ring' | 'discFill' | 'picture'

export interface BadgeProbeResult {
  tool: EditorTool
  plane: LayerPlane
  size: number
  pixels: Record<BadgeProbeKey, Rgb>
}

const KEYS: readonly BadgeProbeKey[] = ['ring', 'discFill', 'picture'] as const

/** Render one badge state at `size` and sample the three probes. */
export function renderBadgeProbe(
  tool: EditorTool,
  plane: LayerPlane,
  size: number,
  tile: Gdk.Paintable | null,
  pngPath?: string,
): BadgeProbeResult {
  const reader = renderSquare(() => new BrushBadge({ size, tool, plane, tilePaintable: tile }), size, pngPath)
  const probes = brushBadgeProbes(size)
  const pixels = {} as Record<BadgeProbeKey, Rgb>
  for (const key of KEYS) {
    const { x, y } = probes[key]
    pixels[key] = reader.at(x, y)
  }
  return { tool, plane, size, pixels }
}
