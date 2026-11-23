import { gettext as _ } from 'gettext'
import type { ActionData } from '@pixelrpg/engine'
import type { SummaryText } from './event-action-model.ts'

/** Fill `%1$s`, `%2$s`, … so a translation may reorder what it shows. */
function fill(template: string, ...args: Array<string | number>): string {
  return template.replace(/%(\d+)\$s/g, (_m, n: string) => String(args[Number(n) - 1] ?? ''))
}

/**
 * The sentences of an action's row title, translated. Each msgid is a
 * literal `_()` call so `xgettext` finds it; a placeholder is `%N$s`.
 */
export function summaryText(): SummaryText {
  return {
    showText: (text) => fill(_('Show text: %1$s'), text),
    teleport: (map, x, y) => fill(_('Teleport → %1$s (%2$s, %3$s)'), map, x, y),
    giveItem: (qty, item) => fill(_('Give %1$s× %2$s'), qty, item),
    setFlagYesNo: (flag, on) => fill(on ? _('Set “%1$s” to yes') : _('Set “%1$s” to no'), flag),
    setFlagValue: (flag, value) => fill(_('Set “%1$s” to %2$s'), flag, value),
    changeCounter: (flag, amount) =>
      fill(amount < 0 ? _('Change “%1$s” by %2$s') : _('Change “%1$s” by +%2$s'), flag, amount),
    playSound: (sound) => fill(_('Play sound: %1$s'), sound),
    wait: (ms) => fill(_('Wait %1$s ms'), ms),
    ask: (prompt, answers) => fill(_('Ask: %1$s (%2$s)'), prompt, answers),
  }
}

/** The "Add action" menu label of an action type. */
export function actionLabel(type: ActionData['type']): string {
  switch (type) {
    case 'show-text':
      return _('Show text')
    case 'teleport':
      return _('Teleport')
    case 'give-item':
      return _('Give item')
    case 'set-flag':
      return _('Set flag')
    case 'change-counter':
      return _('Change counter')
    case 'play-sfx':
      return _('Play sound')
    case 'wait':
      return _('Wait')
    case 'ask':
      return _('Ask a question')
  }
}
