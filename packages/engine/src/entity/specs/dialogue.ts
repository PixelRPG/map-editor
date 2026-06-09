import { DialogueComponent } from '../../components/index.ts'
import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/** Dialogue — lines shown on interaction (split out of the old NPC kind). */
interface DialogueData extends ComponentData {
  type: 'dialogue'
  dialogueId: string
}

export const dialogueSpec: ComponentSpec = {
  type: 'dialogue',
  editor: { label: 'Dialogue', icon: 'chat-symbolic', markerColor: '#66cc66' },
  fields: [{ key: 'dialogueId', label: 'Dialogue id', input: 'text', required: true, basic: true }],
  build: (data) => {
    const d = data as DialogueData
    return new DialogueComponent(d.dialogueId)
  },
}
