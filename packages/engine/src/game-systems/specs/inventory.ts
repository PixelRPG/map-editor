import { itemSpec } from '../../entity/specs/item.ts'
import { ItemPickupSystem } from '../../systems/item-pickup.system.ts'
import type { GameSystemSpec } from '../game-system-spec.ts'

/**
 * `inventory` — things the player can pick up.
 *
 * Base (no switch): the `item` component and its pickup system already
 * ship and already work, and every other system that wants a bag
 * (combat, the economy, turn-based encounters) wants this one, not a
 * copy of it. Moving `item` out of `core` and under a named owner is what
 * makes that reuse a `requires` line later instead of a merge.
 *
 * The bag itself — an `InventoryComponent` on the session singleton, an
 * `item-def` library entity, `INVENTORY_CHANGED` — lands with the first
 * system that reads a bag. Today `ITEM_PICKED_UP` is surfaced as a
 * playtest toast by the host, which is the whole of the observable
 * behaviour and is unchanged by this milestone.
 */
export const inventoryGameSystem: GameSystemSpec = {
  id: 'inventory',
  editor: {
    label: 'Inventory',
    kidLabel: 'Picking things up',
    icon: 'package-x-generic-symbolic',
    base: true,
  },
  components: [itemSpec],
  runtime: (ctx) => [new ItemPickupSystem(ctx.events)],
}
