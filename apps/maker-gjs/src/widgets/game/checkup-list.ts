import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { gettext as _, ngettext } from 'gettext'

import type { CheckupFact, CheckupRow, CheckupSeverity } from '../../services/game-checkup.model.ts'

/**
 * The Checkup group's wording — the other half of
 * `services/game-checkup.model.ts`, which emits FACTS and leaves every
 * sentence to this file. The model stays string-free so a unit test can
 * state what it found without pulling gettext in; the widget side owns
 * the words, the icon and the row.
 *
 * Each sentence is interpolated with `_('…%s…').replace('%s', value)`
 * rather than a template literal inside `_()`: a msgid has to be a
 * literal the extractor can see, and a map name holding a stray `%s`
 * must not swallow the next placeholder (the reasoning
 * `world/map-dialogs.ts` already follows).
 */

/** Title + one-line explanation for one finding. */
export interface CheckupRowText {
  readonly title: string
  readonly subtitle: string
}

/** How the row's prefix icon reads at a glance. */
interface SeverityLook {
  readonly icon: string
  /** Adwaita colour class, or `null` to leave the icon the plain label colour. */
  readonly cssClass: string | null
}

const SEVERITY_LOOKS: Record<CheckupSeverity, SeverityLook> = {
  // A problem stops the game from running, but nothing is broken or
  // lost, so it is a warning rather than an error: the Game page's job
  // here is a to-do list, not an alarm.
  problem: { icon: 'dialog-warning-symbolic', cssClass: 'warning' },
  hint: { icon: 'dialog-information-symbolic', cssClass: null },
  ready: { icon: 'object-select-symbolic', cssClass: 'success' },
}

/** "See them all in the World view." — shared by both overflow rows. */
function seeInWorld(): string {
  return _('See them all in the World view.')
}

/** The sentence pair one finding reads as. */
export function checkupRowText(fact: CheckupFact): CheckupRowText {
  switch (fact.kind) {
    case 'ready':
      return {
        title: _('Ready to play'),
        subtitle: _('Everything a game needs is here.'),
      }
    case 'no-hero':
      // With no character at all there is nothing to pick, so the
      // sentence asks for the step that actually comes first.
      return fact.characterCount === 0
        ? { title: _('No hero yet'), subtitle: _('Make a character for the player to be.') }
        : { title: _('No hero yet'), subtitle: _('Say which character the player is.') }
    case 'no-start-map':
      return fact.mapCount === 0
        ? { title: _('No map yet'), subtitle: _('Make a map for the game to start on.') }
        : { title: _('No start map'), subtitle: _('Choose which map the game opens on.') }
    case 'door-goes-nowhere': {
      const title =
        fact.doorLabel.length > 0 ? _('“%s” goes nowhere').replace('%s', fact.doorLabel) : _('A door goes nowhere')
      return { title, subtitle: _('On %s. Give it a map to lead to.').replace('%s', fact.mapName) }
    }
    case 'more-doors':
      return {
        title: ngettext('%d more door goes nowhere', '%d more doors go nowhere', fact.count).replace(
          '%d',
          String(fact.count),
        ),
        subtitle: seeInWorld(),
      }
    case 'map-unreachable':
      return {
        title: _('Nothing leads to %s').replace('%s', fact.mapName),
        subtitle: _('No door goes there, so the hero cannot reach it.'),
      }
    case 'more-unreachable':
      return {
        title: ngettext('%d more map has no way in', '%d more maps have no way in', fact.count).replace(
          '%d',
          String(fact.count),
        ),
        subtitle: seeInWorld(),
      }
  }
}

/**
 * One row of the Checkup list. Activatable whenever there is somewhere
 * to go — the row IS the deep link (REDESIGN.md § 4.5), so there is no
 * "Fix" button beside it to aim at.
 */
export function buildCheckupRow(row: CheckupRow, onActivate: (() => void) | null): Adw.ActionRow {
  const text = checkupRowText(row.fact)
  const actionRow = new Adw.ActionRow({
    title: text.title,
    subtitle: text.subtitle,
    // Map and door names are user data: a door called "Gate <of> Doom"
    // must read as itself rather than vanish into a broken tag.
    useMarkup: false,
    activatable: onActivate !== null,
  })

  const look = SEVERITY_LOOKS[row.severity]
  const icon = new Gtk.Image({ iconName: look.icon, valign: Gtk.Align.CENTER })
  if (look.cssClass) icon.add_css_class(look.cssClass)
  actionRow.add_prefix(icon)

  if (onActivate) {
    actionRow.add_suffix(new Gtk.Image({ iconName: 'go-next-symbolic', valign: Gtk.Align.CENTER }))
    actionRow.connect('activated', onActivate)
  }
  return actionRow
}
