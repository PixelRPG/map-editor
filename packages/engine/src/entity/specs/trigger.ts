import { TriggerComponent } from '../../components/index.ts'
import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/** Trigger — how the entity activates (mirrors the shipped `TriggerSpec`). */
interface TriggerData extends ComponentData {
  type: 'trigger'
  on: 'walk-onto' | 'walk-off' | 'action-button' | 'auto' | 'none'
  once?: boolean
  scriptId?: string
}

export const triggerSpec: ComponentSpec = {
  type: 'trigger',
  editor: { label: 'Trigger', icon: 'media-playback-start-symbolic', markerColor: '#66ffcc' },
  fields: [
    {
      key: 'on',
      label: 'Activation',
      input: 'select',
      required: true,
      basic: true,
      default: 'action-button',
      options: [
        { value: 'walk-onto', label: 'Walk onto' },
        { value: 'walk-off', label: 'Walk off' },
        { value: 'action-button', label: 'Action button' },
        { value: 'auto', label: 'Auto (on load)' },
        { value: 'none', label: 'None (passive)' },
      ],
    },
    { key: 'once', label: 'Fire once per visit', input: 'bool' },
    { key: 'scriptId', label: 'Script', input: 'text' },
  ],
  build: (data) => {
    const d = data as TriggerData
    return new TriggerComponent(d.on, d.once ?? false, d.scriptId)
  },
}
