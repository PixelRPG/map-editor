// Numbered-placeholder substitution for translated strings.

/**
 * Fill `%1$s`, `%2$s`, … in `template` from `values`, in ONE pass.
 *
 * Two reasons this is not a pair of `.replace()` calls. Numbered
 * placeholders exist so a translator can reorder the arguments — German
 * and English do not put two map names in the same order — and
 * `.replace('%1$s', a).replace('%2$s', b)` would also substitute into
 * whatever `a` just inserted: a map literally named `%2$s` is absurd,
 * but a map named `100%` is not, and `$` sequences in a replacement
 * string have their own meaning to `String.replace`. A single regex
 * pass with a function replacement reads each placeholder from the
 * original template and inserts the value verbatim.
 *
 * A placeholder with no value is left standing rather than blanked, so
 * a mistranslated string shows up as itself instead of as a sentence
 * with a hole in it.
 */
export function fillPlaceholders(template: string, ...values: readonly string[]): string {
  return template.replace(/%(\d+)\$s/g, (match, index: string) => values[Number(index) - 1] ?? match)
}
