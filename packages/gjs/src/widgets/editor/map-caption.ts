import { ngettext } from 'gettext'

import { joinDetails, type MapSelectionFacts } from './map-summary.model.ts'

/**
 * The one-line facts caption for a map — `176 × 148 · 2 doors`.
 *
 * Two surfaces state the same facts about the same map: the selection
 * bar's caption and a row of the World view's list mode
 * (REDESIGN.md § 4.2). They live in different packages' widgets, so the
 * formatting is here rather than private to either — the plural forms
 * are translated strings, and a second copy of `'%d door'` is a second
 * thing to keep in step.
 *
 * The counting itself is pure in `map-summary.model.ts`, which must stay
 * gettext-free; this is the thin translated layer above it.
 *
 * A map whose size is unknown (no terrain rows and no card geometry)
 * says nothing rather than `0 × 0`. Things are a Full-view fact: in
 * Simple view the caption stays down to the two numbers a child needs
 * to recognise the map.
 */
export function mapCaption(facts: MapSelectionFacts, options: { things?: boolean } = {}): string {
  const parts: string[] = []
  if (facts.cols > 0 && facts.rows > 0) parts.push(`${facts.cols} × ${facts.rows}`)
  if (facts.doors > 0) {
    parts.push(ngettext('%d door', '%d doors', facts.doors).replace('%d', String(facts.doors)))
  }
  if (options.things && facts.things > 0) {
    parts.push(ngettext('%d thing', '%d things', facts.things).replace('%d', String(facts.things)))
  }
  return joinDetails(parts)
}
