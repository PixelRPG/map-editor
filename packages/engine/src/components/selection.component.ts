import { Component } from 'excalibur'

/**
 * Selected object placements in the active scene. Carries stable
 * placement ids (matching `MapData.objectPlacements[].id`) — never
 * Excalibur runtime entity ids, per the workspace-wide rule in
 * `AGENTS.md` § Transport-ready primitives.
 *
 * Single-select is just `placementIds.length === 1`; future
 * marquee-select fills the same array. Empty selection is modelled
 * by `SessionState.unset`-ing the component (preferred) or holding
 * an empty array — both compare-equal at the listener level.
 *
 * Selection of layers / library entries gets its own dedicated
 * component when those flows land (Phase 4b). Different selection
 * kinds are orthogonal; one type per concern keeps the
 * subscription bridge surface narrow.
 */
export class SelectedPlacementsComponent extends Component {
  constructor(public placementIds: string[]) {
    super()
  }
}
