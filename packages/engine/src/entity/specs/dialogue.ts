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
 * Both fields are localized text: `speaker` one, `lines` a list. They
 * declare the `localized-text` / `localized-text-list` inputs, which the
 * inspector renders as an entry row and a list of entry rows. A line may
 * be left empty while it is being written; the game skips a page with
 * nothing to say in the language it plays (`EventActionSystem`).
 */
export const dialogueSpec: ComponentSpec = {
  type: 'dialogue',
  system: 'core',
  editor: { label: 'Dialogue', icon: 'chat-symbolic', markerColor: '#66cc66', basic: true },
  fields: [
    { key: 'speaker', label: 'Who speaks', input: 'localized-text', basic: true },
    { key: 'lines', label: 'What it says', input: 'localized-text-list', basic: true, default: [] },
  ],
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
