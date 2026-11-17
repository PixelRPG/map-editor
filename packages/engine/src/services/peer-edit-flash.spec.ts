/**
 * Which incoming remote ops get an attribution flash, and in whose
 * colour. The drawing half needs Excalibur's raster stack; this covers
 * the decision, which is where the interesting branches are — including
 * the one that matters most in a shared session: a human peer's own edit
 * must NOT be attributed to the AI.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { Command, CommandFootprint } from '../commands/index.ts'
import { ASSISTANT_PEER_ID } from './assistant-presence.ts'
import { resolveEditFlash } from './peer-edit-flash.ts'

const ASSISTANT_COLOUR = '#9141ac'

/** Minimal stand-in for a wire-reconstructed command. */
function command(footprint?: CommandFootprint | null): Command {
  const base = {
    kind: 'tile.paint',
    label: 'Paint tile',
    payload: {},
    apply: () => {},
    revert: () => {},
  }
  if (footprint === undefined) return base as Command
  return { ...base, footprint: () => footprint } as Command
}

const colourFor = (origin: string) => (origin === ASSISTANT_PEER_ID ? ASSISTANT_COLOUR : null)

const painted: CommandFootprint = { layerId: 'ground', tiles: [{ tileX: 2, tileY: 3 }] }

export default async () => {
  await describe('peer-edit-flash.resolveEditFlash', async () => {
    await it('flashes an attributed edit in the origin colour', async () => {
      expect(resolveEditFlash(command(painted), ASSISTANT_PEER_ID, colourFor)).toStrictEqual({
        layerId: 'ground',
        tiles: [{ tileX: 2, tileY: 3 }],
        colour: ASSISTANT_COLOUR,
      })
    })

    await it('ignores an op with no origin', async () => {
      // A human peer's own edit: their cursor already says where they
      // are, and outlining it would read as someone else's doing.
      expect(resolveEditFlash(command(painted), undefined, colourFor)).toBe(null)
    })

    await it('ignores an origin the host has no colour for', async () => {
      expect(resolveEditFlash(command(painted), 'peer-7', colourFor)).toBe(null)
    })

    await it('ignores a command that touches no tiles', async () => {
      // Layer rename, plane reorder — nothing to point at.
      expect(resolveEditFlash(command(), ASSISTANT_PEER_ID, colourFor)).toBe(null)
    })

    await it('ignores a command whose footprint is unresolvable', async () => {
      expect(resolveEditFlash(command(null), ASSISTANT_PEER_ID, colourFor)).toBe(null)
    })

    await it('ignores an empty tile list', async () => {
      const empty: CommandFootprint = { layerId: 'ground', tiles: [] }
      expect(resolveEditFlash(command(empty), ASSISTANT_PEER_ID, colourFor)).toBe(null)
    })

    await it('carries every cell of a multi-cell edit', async () => {
      const fill: CommandFootprint = {
        layerId: 'water',
        tiles: [
          { tileX: 0, tileY: 0 },
          { tileX: 1, tileY: 0 },
        ],
      }
      expect(resolveEditFlash(command(fill), ASSISTANT_PEER_ID, colourFor)?.tiles.length).toBe(2)
    })
  })
}
