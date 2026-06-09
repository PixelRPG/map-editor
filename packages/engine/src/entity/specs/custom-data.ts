import { CustomDataComponent } from '../../components/index.ts'
import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/** Custom data — a free-form project-specific bag (escape hatch). */
interface CustomData extends ComponentData {
  type: 'custom-data'
  data?: Record<string, unknown>
}

export const customDataSpec: ComponentSpec = {
  type: 'custom-data',
  editor: { label: 'Custom data', icon: 'view-list-symbolic' },
  fields: [{ key: 'data', label: 'Data (JSON)', input: 'json' }],
  build: (data) => {
    const d = data as CustomData
    return new CustomDataComponent({ ...(d.data ?? {}) })
  },
}
