import { ItemComponent } from '../../components/index.ts'
import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/** Item — pickup granting an inventory item (mirrors `ItemProperties`). */
interface ItemData extends ComponentData {
  type: 'item'
  itemId: string
  qty?: number
  pickupSound?: string
}

export const itemSpec: ComponentSpec = {
  type: 'item',
  editor: { label: 'Item pickup', icon: 'package-x-generic-symbolic', markerColor: '#ffcc33' },
  fields: [
    { key: 'itemId', label: 'Item id', input: 'text', required: true, basic: true },
    { key: 'qty', label: 'Quantity', input: 'int', basic: true, default: 1, min: 1 },
    { key: 'pickupSound', label: 'Pickup sound', input: 'text' },
  ],
  build: (data) => {
    const d = data as ItemData
    return new ItemComponent(d.itemId, d.qty ?? 1, d.pickupSound)
  },
}
