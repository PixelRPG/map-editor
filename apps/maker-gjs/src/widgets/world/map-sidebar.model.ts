// Pure projections behind the World view's map sidebar (REDESIGN.md
// § 4.2): one row per map and the details of the selected one. GTK-free
// and gettext-free so it can be unit-tested; the widget owns every
// translated string.

import type { SampleScene, SampleTeleport } from '@pixelrpg/gjs'
// The subpath, not the barrel: the barrel pulls every widget into the node
// test graph, which cannot resolve their `@gjsify/empty` stubs.
import {
  type MapSelectionFacts,
  mapSelectionFacts,
  type TeleportSummary,
  teleportSummaries,
} from '@pixelrpg/gjs/map-summary'

/** One row of the sidebar's map list. */
export interface MapRowModel {
  readonly id: string
  readonly name: string
  /** The map the game opens on. */
  readonly isStart: boolean
  readonly facts: MapSelectionFacts
}

/** The details group for the selected map. */
export interface MapDetailsModel {
  readonly id: string
  readonly name: string
  readonly facts: MapSelectionFacts
  /** Doors touching the map, outgoing and incoming. */
  readonly doors: readonly MapDoorModel[]
}

/**
 * A door as the details list shows it. A door lives on the map that
 * sends the hero, so an incoming door's `ownerMapId` is the OTHER map —
 * the pair `win.focus-placement` needs to land on it.
 */
export interface MapDoorModel extends TeleportSummary {
  readonly ownerMapId: string
  readonly placementId: string
}

/** Rows in world order, flagging the start map. */
export function mapRows(
  scenes: readonly SampleScene[],
  teleports: readonly SampleTeleport[],
  startMapId: string | null,
): MapRowModel[] {
  return scenes.map((scene) => ({
    id: scene.id,
    name: scene.name,
    isStart: scene.id === startMapId,
    facts: mapSelectionFacts(scene, teleports),
  }))
}

/** Details for `selectedId`, or `null` when nothing (or an unknown id) is selected. */
export function mapDetails(
  scenes: readonly SampleScene[],
  teleports: readonly SampleTeleport[],
  selectedId: string | null,
): MapDetailsModel | null {
  const scene = selectedId ? scenes.find((s) => s.id === selectedId) : undefined
  if (!scene) return null
  // Same filter as `teleportSummaries`, so the two lists zip 1:1.
  const touching = teleports.filter((t) => t.from === scene.id || t.to === scene.id)
  const summaries = teleportSummaries(scene, scenes, teleports)
  return {
    id: scene.id,
    name: scene.name,
    facts: mapSelectionFacts(scene, teleports),
    doors: summaries.map((summary, i) => ({
      ...summary,
      ownerMapId: touching[i].from,
      placementId: touching[i].placementId,
    })),
  }
}

/** Index of `id` in the rows, or -1. The list's selection key. */
export function rowIndexOf(rows: readonly MapRowModel[], id: string | null): number {
  return id ? rows.findIndex((row) => row.id === id) : -1
}
