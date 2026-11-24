import { gettext as _ } from 'gettext'
import type { ConditionKind, ConditionText } from './condition-model.ts'

/** Fill `%1$s`, `%2$s`, … so a translation may reorder what it shows. */
function fill(template: string, ...args: Array<string | number>): string {
  return template.replace(/%(\d+)\$s/g, (_m, n: string) => String(args[Number(n) - 1] ?? ''))
}

/**
 * The sentences of a condition summary, translated. Each msgid is a
 * literal `_()` call so `xgettext` finds it; a placeholder is `%N$s`.
 */
export function conditionText(): ConditionText {
  return {
    flagIsYesNo: (flag, on) => fill(on ? _('%1$s is Yes') : _('%1$s is No'), flag),
    flagIsText: (flag, value) => fill(_('%1$s is “%2$s”'), flag, value),
    counter: (flag, op, value) => fill(_('%1$s %2$s %3$s'), flag, op, value),
    hasItem: (item) => fill(_('Has item %1$s'), item),
    all: (parts) => parts.join(_(' and ')),
    any: (parts) => parts.join(_(' or ')),
    not: (part) => fill(_('Not: %1$s'), part),
    noFlag: _('…'),
    when: {
      // Translators: a state card's condition. %1$s is a flag name; "Yes" is the flag being switched on.
      flagIsYesNo: (flag, on) => fill(on ? _('When %1$s is Yes') : _('When %1$s is No'), flag),
      // Translators: a state card's condition. %1$s is a flag name, %2$s the word it must hold.
      flagIsText: (flag, value) => fill(_('When %1$s is “%2$s”'), flag, value),
      // Translators: a state card's condition. %1$s is a number flag, %2$s a comparison sign (≥, ≤, =, …), %3$s a number.
      counter: (flag, op, value) => fill(_('When %1$s %2$s %3$s'), flag, op, value),
      // Translators: a state card's condition. %1$s is the name of an item.
      hasItem: (item) => fill(_('When the player has item %1$s'), item),
      // Translators: a state card's condition. %1$s is a list of short conditions separated by semicolons; all must hold.
      all: (parts) => fill(_('When all of: %1$s'), parts),
      // Translators: a state card's condition. %1$s is a list of short conditions separated by semicolons; one must hold.
      any: (parts) => fill(_('When any of: %1$s'), parts),
      // Translators: a state card's condition. %1$s is a short condition that must NOT hold.
      not: (part) => fill(_('When not: %1$s'), part),
      manual: _('Only when switched on by an action'),
    },
  }
}

/** The label of a condition shape in the "Kind" dropdown. */
export function conditionKindLabel(kind: ConditionKind): string {
  switch (kind) {
    case 'flag-is':
      return _('A flag is')
    case 'counter':
      return _('A number compares')
    case 'has-item':
      return _('Has an item')
    case 'all':
      return _('All of these')
    case 'any':
      return _('Any of these')
    case 'not':
      return _('None of this')
  }
}
