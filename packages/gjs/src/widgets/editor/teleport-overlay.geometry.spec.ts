import { describe, expect, it } from '@gjsify/unit'

import type { SceneRect } from './atlas-canvas.geometry.ts'
import {
  arrowheadPoints,
  cardAtPoint,
  clearOfRects,
  clipToViewport,
  controlPoint,
  CURVE_OFFSET_FACTOR,
  CURVE_OFFSET_MAX,
  distanceToQuad,
  FAN_STEP,
  fanFactor,
  fannedControl,
  type OverlayPoint,
  type PlacedLabel,
  pointOnQuad,
  rectContains,
  repeatsLabel,
  stubEnd,
  teleportEndpoint,
  tileAtPoint,
} from './teleport-overlay.geometry.ts'

/** An 11x11 map drawn as an 88x88 body at (100, 200) — 8 px per tile. */
const card = { rect: { x: 100, y: 200, w: 88, h: 88 }, cols: 11, rows: 11 }

/** Rounded compare — the geometry is float math, not exact decimals. */
function near(point: OverlayPoint, x: number, y: number, digits = 6): void {
  expect(Number(point.x.toFixed(digits))).toBe(Number(x.toFixed(digits)))
  expect(Number(point.y.toFixed(digits))).toBe(Number(y.toFixed(digits)))
}

export default async () => {
  await describe('teleport-overlay.geometry', async () => {
    await describe('teleportEndpoint', async () => {
      await it('lands on the CENTRE of the tile, not its corner', async () => {
        near(teleportEndpoint(card, { x: 0, y: 0 }), 104, 204)
      })

      await it('steps one tile per index', async () => {
        near(teleportEndpoint(card, { x: 3, y: 2 }), 100 + 3.5 * 8, 200 + 2.5 * 8)
      })

      await it('reads the scale off the body rect, not a zoom', async () => {
        // The same map drawn twice as large: every endpoint follows,
        // which is what keeps the overlay aligned with a card that hit
        // the minimum-size floor.
        const doubled = { rect: { x: 100, y: 200, w: 176, h: 176 }, cols: 11, rows: 11 }
        near(teleportEndpoint(doubled, { x: 0, y: 0 }), 108, 208)
      })

      await it('puts the last tile inside the body, not on its edge', async () => {
        near(teleportEndpoint(card, { x: 10, y: 10 }), 184, 284)
      })

      await it('treats a non-square map per axis', async () => {
        const wide = { rect: { x: 0, y: 0, w: 100, h: 50 }, cols: 10, rows: 5 }
        near(teleportEndpoint(wide, { x: 0, y: 0 }), 5, 5)
      })

      await it('handles a zero-size map without NaN', async () => {
        near(teleportEndpoint({ rect: { x: 10, y: 20, w: 0, h: 0 }, cols: 0, rows: 0 }, { x: 5, y: 5 }), 10, 20)
      })
    })

    await describe('tileAtPoint', async () => {
      await it('inverts teleportEndpoint for every tile of the card', async () => {
        for (let y = 0; y < card.rows; y++) {
          for (let x = 0; x < card.cols; x++) {
            const tile = tileAtPoint(card, teleportEndpoint(card, { x, y }))
            expect(tile.x).toBe(x)
            expect(tile.y).toBe(y)
          }
        }
      })

      await it('reads a tile corner as that tile, not the one before it', async () => {
        const tile = tileAtPoint(card, { x: 100, y: 200 })
        expect(tile.x).toBe(0)
        expect(tile.y).toBe(0)
      })

      await it('clamps a drop past the far edge to the last tile', async () => {
        const tile = tileAtPoint(card, { x: 400, y: 900 })
        expect(tile.x).toBe(10)
        expect(tile.y).toBe(10)
      })

      await it('clamps a drop before the card to the first tile', async () => {
        const tile = tileAtPoint(card, { x: -50, y: 0 })
        expect(tile.x).toBe(0)
        expect(tile.y).toBe(0)
      })

      await it('reads a non-square map per axis', async () => {
        const wide = { rect: { x: 0, y: 0, w: 100, h: 50 }, cols: 10, rows: 5 }
        const tile = tileAtPoint(wide, { x: 95, y: 45 })
        expect(tile.x).toBe(9)
        expect(tile.y).toBe(4)
      })

      await it('falls back to tile (0, 0) for a card with no area', async () => {
        const tile = tileAtPoint({ rect: { x: 10, y: 20, w: 0, h: 0 }, cols: 0, rows: 0 }, { x: 99, y: 99 })
        expect(tile.x).toBe(0)
        expect(tile.y).toBe(0)
      })
    })

    await describe('cardAtPoint', async () => {
      const cards = [
        { mapId: 'left', rect: { x: 0, y: 0, w: 100, h: 100 } },
        { mapId: 'right', rect: { x: 200, y: 0, w: 100, h: 100 } },
      ]

      await it('names the card the point is inside', async () => {
        expect(cardAtPoint(cards, { x: 50, y: 50 })).toBe('left')
        expect(cardAtPoint(cards, { x: 250, y: 50 })).toBe('right')
      })

      await it('returns null for a point on the backdrop', async () => {
        expect(cardAtPoint(cards, { x: 150, y: 50 })).toBe(null)
      })

      await it('returns null for an empty atlas', async () => {
        expect(cardAtPoint([], { x: 0, y: 0 })).toBe(null)
      })

      await it('picks the LAST overlapping card — the one drawn on top', async () => {
        const stacked = [
          { mapId: 'under', rect: { x: 0, y: 0, w: 100, h: 100 } },
          { mapId: 'over', rect: { x: 50, y: 50, w: 100, h: 100 } },
        ]
        expect(cardAtPoint(stacked, { x: 75, y: 75 })).toBe('over')
        expect(cardAtPoint(stacked, { x: 10, y: 10 })).toBe('under')
      })

      await it('counts the far edge of a card as a hit', async () => {
        expect(cardAtPoint(cards, { x: 100, y: 100 })).toBe('left')
      })
    })

    await describe('controlPoint', async () => {
      await it('bows perpendicular to a horizontal segment', async () => {
        // Length 100 → offset 25, perpendicular of (+x) is (+y).
        near(controlPoint({ x: 0, y: 0 }, { x: 100, y: 0 }), 50, 25)
      })

      await it('bows perpendicular to a vertical segment', async () => {
        // Perpendicular of (+y) is (-x).
        near(controlPoint({ x: 0, y: 0 }, { x: 0, y: 100 }), -25, 50)
      })

      await it('caps the bow on a long segment', async () => {
        const control = controlPoint({ x: 0, y: 0 }, { x: 1000, y: 0 })
        expect(control.y).toBe(CURVE_OFFSET_MAX)
      })

      await it('uses the proportional bow just below the cap', async () => {
        const length = CURVE_OFFSET_MAX / CURVE_OFFSET_FACTOR - 4
        const control = controlPoint({ x: 0, y: 0 }, { x: length, y: 0 })
        expect(control.y).toBe(length * CURVE_OFFSET_FACTOR)
        expect(control.y < CURVE_OFFSET_MAX).toBe(true)
      })

      await it('switches to the cap exactly at the crossover length', async () => {
        const length = CURVE_OFFSET_MAX / CURVE_OFFSET_FACTOR
        expect(controlPoint({ x: 0, y: 0 }, { x: length, y: 0 }).y).toBe(CURVE_OFFSET_MAX)
      })

      await it('mirrors when the endpoints swap (the curve bows the other way)', async () => {
        const forward = controlPoint({ x: 0, y: 0 }, { x: 100, y: 0 })
        const backward = controlPoint({ x: 100, y: 0 }, { x: 0, y: 0 })
        expect(forward.x).toBe(backward.x)
        expect(forward.y).toBe(-backward.y)
      })

      await it('stays finite for coincident endpoints (a self-teleport)', async () => {
        const control = controlPoint({ x: 7, y: 9 }, { x: 7, y: 9 })
        expect(Number.isFinite(control.x)).toBe(true)
        expect(Number.isFinite(control.y)).toBe(true)
        near(control, 7, 9)
      })
    })

    await describe('arrowheadPoints', async () => {
      await it('puts the tip first and the base behind it', async () => {
        const [tip, left, right] = arrowheadPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)
        near(tip, 100, 0)
        near(left, 90, 6)
        near(right, 90, -6)
      })

      await it('points along the incoming direction, not the axes', async () => {
        const [, left, right] = arrowheadPoints({ x: 0, y: 0 }, { x: 0, y: 50 }, 10)
        // Direction (+y): base sits 10 px back at y = 40, corners on ±x.
        near(left, -6, 40)
        near(right, 6, 40)
      })

      await it('keeps the base perpendicular to the tip direction', async () => {
        const [tip, left, right] = arrowheadPoints({ x: 0, y: 0 }, { x: 30, y: 40 }, 10)
        const baseVectorX = right.x - left.x
        const baseVectorY = right.y - left.y
        const dirX = tip.x - 0
        const dirY = tip.y - 0
        // Dot product of the base edge with the direction must vanish.
        expect(Math.abs(baseVectorX * dirX + baseVectorY * dirY) < 1e-9).toBe(true)
      })

      await it('makes the base 1.2 x the arrow length', async () => {
        const [, left, right] = arrowheadPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)
        expect(Number(Math.hypot(right.x - left.x, right.y - left.y).toFixed(6))).toBe(12)
      })

      await it('collapses to a point for coincident from / tip instead of NaN', async () => {
        const points = arrowheadPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)
        for (const point of points) {
          expect(Number.isFinite(point.x)).toBe(true)
          expect(Number.isFinite(point.y)).toBe(true)
        }
      })

      await it('degenerates to the tip at size 0', async () => {
        const [tip, left, right] = arrowheadPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)
        near(tip, 10, 0)
        near(left, 10, 0)
        near(right, 10, 0)
      })
    })

    await describe('fanFactor', async () => {
      await it('leaves a lone line exactly where the bow put it', async () => {
        expect(fanFactor(0, 1)).toBe(1)
      })

      await it('straddles the unfanned bow for a pair', async () => {
        expect(fanFactor(0, 2)).toBe(1 - FAN_STEP / 2)
        expect(fanFactor(1, 2)).toBe(1 + FAN_STEP / 2)
      })

      await it('keeps the middle line of an odd group unmoved', async () => {
        expect(fanFactor(1, 3)).toBe(1)
      })

      await it('spaces every neighbour one step apart', async () => {
        const factors = [0, 1, 2, 3].map((index) => fanFactor(index, 4))
        for (let i = 1; i < factors.length; i++) {
          expect(Number((factors[i] - factors[i - 1]).toFixed(6))).toBe(FAN_STEP)
        }
      })

      await it('is symmetric about the centre', async () => {
        expect(Number((fanFactor(0, 5) + fanFactor(4, 5)).toFixed(6))).toBe(2)
      })

      await it('never gives two lines of a group the same factor', async () => {
        const factors = new Set([0, 1, 2, 3, 4, 5, 6].map((index) => fanFactor(index, 7)))
        expect(factors.size).toBe(7)
      })

      await it('treats a zero count like a lone line', async () => {
        expect(fanFactor(0, 0)).toBe(1)
      })
    })

    await describe('fannedControl', async () => {
      const a = { x: 0, y: 0 }
      const b = { x: 100, y: 0 }

      await it('reproduces the plain control point at factor 1', async () => {
        const plain = controlPoint(a, b)
        near(fannedControl(a, b, 1), plain.x, plain.y)
      })

      await it('collapses onto the chord midpoint at factor 0', async () => {
        near(fannedControl(a, b, 0), 50, 0)
      })

      await it('scales the bow linearly', async () => {
        const plain = controlPoint(a, b)
        const half = fannedControl(a, b, 0.5)
        near(half, 50 + (plain.x - 50) * 0.5, plain.y * 0.5)
      })

      await it('bows to the other side for a negative factor', async () => {
        const plain = controlPoint(a, b)
        const flipped = fannedControl(a, b, -1)
        near(flipped, 50 - (plain.x - 50), -plain.y)
      })

      await it('stays perpendicular to a diagonal chord', async () => {
        const from = { x: 0, y: 0 }
        const to = { x: 60, y: 80 }
        const control = fannedControl(from, to, 1.5)
        // The offset from the midpoint must have no component along the chord.
        const along = (control.x - 30) * 60 + (control.y - 40) * 80
        expect(Number(along.toFixed(6))).toBe(0)
      })

      await it('stays finite for coincident endpoints', async () => {
        const control = fannedControl({ x: 7, y: 7 }, { x: 7, y: 7 }, 2)
        expect(Number.isFinite(control.x)).toBe(true)
        expect(Number.isFinite(control.y)).toBe(true)
      })
    })

    await describe('pointOnQuad', async () => {
      await it('starts at a and ends at b', async () => {
        near(pointOnQuad({ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }, 0), 0, 0)
        near(pointOnQuad({ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }, 1), 100, 0)
      })

      await it('pulls the midpoint halfway towards the control point', async () => {
        // A quadratic at t = 0.5 is (a + 2c + b) / 4.
        near(pointOnQuad({ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }, 0.5), 50, 50)
      })

      await it('is the straight chord when the control point is on it', async () => {
        near(pointOnQuad({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, 0.25), 25, 0)
      })
    })

    await describe('distanceToQuad', async () => {
      await it('is zero on the curve itself', async () => {
        const a = { x: 0, y: 0 }
        const control = { x: 50, y: 100 }
        const b = { x: 100, y: 0 }
        expect(distanceToQuad(a, control, b, pointOnQuad(a, control, b, 0.5))).toBe(0)
      })

      await it('measures the gap to a point beside the curve', async () => {
        // Straight line along y = 0; the point sits 7 px above it.
        const distance = distanceToQuad({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 7 })
        expect(Number(distance.toFixed(6))).toBe(7)
      })

      await it('follows the BOW, not the chord', async () => {
        // The chord's midpoint is 50 px from the bowed curve's.
        const a = { x: 0, y: 0 }
        const control = { x: 50, y: 100 }
        const b = { x: 100, y: 0 }
        expect(distanceToQuad(a, control, b, { x: 50, y: 0 }) > 40).toBe(true)
      })

      await it('reaches the far endpoint as well as the near one', async () => {
        const a = { x: 0, y: 0 }
        const b = { x: 100, y: 0 }
        expect(distanceToQuad(a, { x: 50, y: 0 }, b, { x: 100, y: 3 })).toBe(3)
      })

      await it('samples at least once rather than dividing by zero', async () => {
        const distance = distanceToQuad({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, 0)
        expect(Number.isFinite(distance)).toBe(true)
        expect(distance).toBe(0)
      })
    })

    await describe('rectContains', async () => {
      const rect = { x: 10, y: 20, w: 100, h: 50 }

      await it('accepts an interior point', async () => {
        expect(rectContains(rect, { x: 50, y: 40 })).toBe(true)
      })

      await it('accepts the edges — a line touching the boundary has not left', async () => {
        expect(rectContains(rect, { x: 10, y: 20 })).toBe(true)
        expect(rectContains(rect, { x: 110, y: 70 })).toBe(true)
      })

      await it('rejects a point past each side', async () => {
        expect(rectContains(rect, { x: 9, y: 40 })).toBe(false)
        expect(rectContains(rect, { x: 111, y: 40 })).toBe(false)
        expect(rectContains(rect, { x: 50, y: 19 })).toBe(false)
        expect(rectContains(rect, { x: 50, y: 71 })).toBe(false)
      })
    })

    await describe('clipToViewport', async () => {
      const viewport = { x: 0, y: 0, w: 100, h: 100 }

      await it('finds where the line leaves the right edge', async () => {
        near(clipToViewport({ x: 50, y: 50 }, { x: 300, y: 50 }, viewport) as OverlayPoint, 100, 50)
      })

      await it('finds where the line leaves the top edge', async () => {
        near(clipToViewport({ x: 50, y: 50 }, { x: 50, y: -50 }, viewport) as OverlayPoint, 50, 0)
      })

      await it('takes the FIRST boundary crossed on a diagonal', async () => {
        // Heading up-right at 45° from (90, 50) hits x = 100 at y = 60,
        // long before y = 100.
        near(clipToViewport({ x: 90, y: 50 }, { x: 190, y: 150 }, viewport) as OverlayPoint, 100, 60)
      })

      await it('is null when both ends are visible', async () => {
        expect(clipToViewport({ x: 10, y: 10 }, { x: 90, y: 90 }, viewport)).toBe(null)
      })

      await it('is null when the line starts off-screen', async () => {
        // The chip names the map at the far end of a line the user can
        // see; a line that starts outside has no visible near end.
        expect(clipToViewport({ x: -10, y: 50 }, { x: 300, y: 50 }, viewport)).toBe(null)
      })

      await it('handles an axis-parallel line without dividing by zero', async () => {
        const exit = clipToViewport({ x: 50, y: 50 }, { x: 50, y: 400 }, viewport) as OverlayPoint
        expect(Number.isFinite(exit.x)).toBe(true)
        near(exit, 50, 100)
      })

      await it('is null for coincident endpoints', async () => {
        expect(clipToViewport({ x: 50, y: 50 }, { x: 50, y: 50 }, viewport)).toBe(null)
      })
    })

    await describe('stubEnd', async () => {
      await it('points straight out of the card', async () => {
        near(stubEnd({ x: 0, y: 0 }, { x: 10, y: 0 }, 5), 15, 0)
      })

      await it('keeps the stub length regardless of how far out the door is', async () => {
        const end = stubEnd({ x: 0, y: 0 }, { x: 30, y: 40 }, 10)
        expect(Number(Math.hypot(end.x - 30, end.y - 40).toFixed(6))).toBe(10)
      })

      await it('leans outwards, away from the centre', async () => {
        const end = stubEnd({ x: 100, y: 100 }, { x: 100, y: 60 }, 12)
        near(end, 100, 48)
      })

      await it('falls back to downwards for a door on the centre', async () => {
        near(stubEnd({ x: 7, y: 7 }, { x: 7, y: 7 }, 9), 7, 16)
      })
    })

    await describe('clearOfRects', async () => {
      /** One 100x100 card at the origin. */
      const card: SceneRect = { x: 0, y: 0, w: 100, h: 100 }
      /** A label pill, as Pango measures one. */
      const pill = { w: 40, h: 16 }

      await it('leaves a pill that already sits clear alone', async () => {
        near(clearOfRects({ x: 200, y: 200 }, pill, [card]), 200, 200)
      })

      await it('lifts a pill off the card it landed on', async () => {
        // Centre (50, 20) is 20 px into a 100 px card: up is the
        // shortest way out.
        near(clearOfRects({ x: 50, y: 20 }, pill, [card]), 50, -8)
      })

      await it('pushes a pill down when that is the shorter way out', async () => {
        near(clearOfRects({ x: 50, y: 90 }, pill, [card]), 50, 108)
      })

      await it('leaves the asked-for air between pill and card', async () => {
        const at = clearOfRects({ x: 50, y: 20 }, pill, [card], 4)
        near(at, 50, -12)
      })

      await it('escapes sideways when the card is taller than it is wide', async () => {
        const tower: SceneRect = { x: 0, y: 0, w: 30, h: 400 }
        const at = clearOfRects({ x: 20, y: 200 }, pill, [tower])
        expect(at.y).toBe(200)
        expect(at.x > 20).toBe(true)
      })

      await it('clears a second card the first nudge pushed it onto', async () => {
        // Lifted off the card, the pill lands on a tall neighbour; the
        // second pass steps it sideways out of that one.
        const corridor: SceneRect = { x: 60, y: -40, w: 24, h: 200 }
        near(clearOfRects({ x: 50, y: 20 }, pill, [card, corridor]), 40, -8)
      })

      await it('leaves the label on its line when no gap fits it', async () => {
        // Two cards 10 px apart: every escape from one lands on the
        // other, so the walk gives up and hands back the curve point.
        near(clearOfRects({ x: 50, y: 20 }, pill, [card, { x: 0, y: -40, w: 100, h: 30 }]), 50, 20)
      })

      await it('ignores a card that has not been drawn yet', async () => {
        near(clearOfRects({ x: 50, y: 20 }, pill, [{ x: 0, y: 0, w: 0, h: 0 }]), 50, 20)
      })

      await it('stays put rather than wandering off when nothing frees it', async () => {
        near(clearOfRects({ x: 50, y: 20 }, pill, [card], 0, 0), 50, 20)
      })

      await it('is unchanged by an empty obstacle list', async () => {
        near(clearOfRects({ x: 1, y: 2 }, pill, []), 1, 2)
      })
    })

    await describe('repeatsLabel', async () => {
      const placed: PlacedLabel[] = [{ text: "Link's Tree House", rect: { x: 100, y: 100, w: 120, h: 20 } }]

      await it('drops the second pill of a two-tile doorway', async () => {
        // Both lines end beside the same card, so both pills are placed
        // at nearly the same point with the same words.
        expect(repeatsLabel(placed, "Link's Tree House", { x: 104, y: 102, w: 120, h: 20 })).toBe(true)
      })

      await it('keeps the same name where it answers a different line', async () => {
        expect(repeatsLabel(placed, "Link's Tree House", { x: 600, y: 400, w: 120, h: 20 })).toBe(false)
      })

      await it('keeps a different name in the same place', async () => {
        expect(repeatsLabel(placed, 'Kokiri Forest', { x: 100, y: 100, w: 120, h: 20 })).toBe(false)
      })

      await it('lets two pills touch edges without calling it a repeat', async () => {
        expect(repeatsLabel(placed, "Link's Tree House", { x: 220, y: 100, w: 120, h: 20 })).toBe(false)
      })

      await it('places the first pill of a snapshot', async () => {
        expect(repeatsLabel([], 'Goes nowhere', { x: 0, y: 0, w: 80, h: 20 })).toBe(false)
      })
    })
  })
}
