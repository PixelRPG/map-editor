import { DialogueComponent } from '../../components/index.ts'
import type { ComponentData } from '../../types/data/index.ts'
import { isLocalizedText, type LocalizedText } from '../../types/data/LocalizedText.ts'
import type { ComponentSpec } from '../component-spec.ts'

/** Dialogue — what the entity says when read: an optional speaker and one box per line. */
export interface DialogueData extends ComponentData {
  type: 'dialogue'
  speaker?: LocalizedText
  lines: LocalizedText[]
}

/**
 * Both fields are localized text, which the flat field DSL cannot hold,
 * so the spec declares none and validates the data itself. The friendly
 * per-line editor is the editor rows' job; until then Simple view shows
 * the component without rows.
 */
export const dialogueSpec: ComponentSpec = {
  type: 'dialogue',
  system: 'core',
  editor: { label: 'Dialogue', icon: 'chat-symbolic', markerColor: '#66cc66', basic: true },
  fields: [],
  validate: (data) => {
    const d = data as Partial<DialogueData> & { dialogueId?: unknown }
    const errors: string[] = []
    if (d.dialogueId !== undefined) errors.push('"dialogueId" is gone — use "lines"')
    if (!Array.isArray(d.lines)) errors.push('"lines" must be a list')
    else
      d.lines.forEach((line, i) => {
        if (!isLocalizedText(line)) errors.push(`line ${i} is not a text`)
      })
    if (d.speaker !== undefined && !isLocalizedText(d.speaker)) errors.push('"speaker" is not a text')
    return errors
  },
  build: (data) => {
    const d = data as DialogueData
    return new DialogueComponent(d.lines.slice(), d.speaker)
  },
}
