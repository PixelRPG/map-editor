import { Component } from 'excalibur'

/**
 * The map is in **pick mode**: the NEXT tap on the canvas names the tile
 * a door on some OTHER map arrives at, instead of doing whatever the
 * armed tool would normally do.
 *
 * This is the §6.2 "Goes to" flow — the user picked a target map in the
 * door's picker, the host opened that map, and this component says the
 * first tap here is the answer. `sourceMapId` + `doorPlacementId` name
 * the door waiting for it, because by the time the tap lands the door's
 * own map is no longer the active scene and the event would otherwise
 * have nothing to point at.
 *
 * Why session state and not a host-side flag, the same argument as
 * {@link PendingPlacementMoveComponent}: the arming changes what a tap
 * MEANS, and `TileEditorSystem` is the only place that decides that. A
 * flag the host kept to itself would still let the tap reach the armed
 * tool, so picking an arrival tile would paint a tile or drop an object
 * on the way past.
 *
 * It lives on the TARGET scene's session-singleton, which gives
 * cancel-on-leave for free: navigating away from the target map drops
 * the scene's session state, so there is no armed pick left over to
 * ambush the next map the user opens.
 *
 * Disarmed is modelled by `SessionState.unset`-ing the component. It is
 * deliberately NOT on the op-log — arming is a local intention, and only
 * the resulting placement edits are `Command`s peers and undo see.
 */
export class PendingArrivalPickComponent extends Component {
  constructor(
    public sourceMapId: string,
    public doorPlacementId: string,
  ) {
    super()
  }
}
