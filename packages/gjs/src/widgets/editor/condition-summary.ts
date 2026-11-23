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
