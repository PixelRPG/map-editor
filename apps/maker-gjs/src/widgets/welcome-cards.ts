import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'
import { MapPreview } from '@pixelrpg/gjs'

import type { RecentProjectEntry } from '../services/recent-projects.ts'
import type { ProjectTemplate } from '../services/templates.ts'

/**
 * The two card shapes of the welcome column (REDESIGN § 4.1): the
 * Continue card that resumes the last project, and the template cards
 * that start a new one. Built here rather than in `welcome-view.ts` so
 * the view stays a thin host — same split as
 * {@link buildRecentProjectRow} in `recent-project-row.ts`.
 */

/**
 * Natural width a template card requests. Two of them plus the
 * `Adw.WrapBox` spacing fit on one line from roughly 560 px of window
 * width and stack below it; `justify: fill` stretches them to the
 * clamp's 720 px on the desktop.
 */
const TEMPLATE_CARD_WIDTH = 240
const TEMPLATE_PREVIEW_HEIGHT = 110
const CONTINUE_PREVIEW_HEIGHT = 176

/**
 * A live map preview of a project's start map. The load is deferred to
 * the next tick so the column lays out first — compositing several
 * previews back to back otherwise blocks the main loop while the
 * window is still measuring.
 */
function buildPreview(projectPath: string, height: number, accentColor?: string): MapPreview {
  const preview = new MapPreview()
  if (accentColor) preview.accentColor = accentColor
  preview.set_size_request(-1, height)
  preview.add_css_class('engine-canvas')
  void Promise.resolve().then(() => preview.loadProject(projectPath))
  return preview
}

/**
 * Longest line a card title requests before wrapping. A card holds a
 * project name the user chose, so it can be arbitrarily long; wrapping
 * at a character count keeps the card's minimum width independent of
 * it. (`ellipsize` would need `Pango.EllipsizeMode`, and
 * `@girs/pango-1.0` is not a dependency of this app.)
 */
const TITLE_MAX_CHARS = 22

function buildTitleBlock(title: string, caption: string): Gtk.Box {
  const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2, hexpand: true })
  const name = new Gtk.Label({
    label: title,
    halign: Gtk.Align.START,
    xalign: 0,
    wrap: true,
    maxWidthChars: TITLE_MAX_CHARS,
  })
  name.add_css_class('heading')
  box.append(name)
  if (caption) {
    const sub = new Gtk.Label({
      label: caption,
      halign: Gtk.Align.START,
      xalign: 0,
      wrap: true,
      maxWidthChars: TITLE_MAX_CHARS,
    })
    sub.add_css_class('caption')
    sub.add_css_class('dim-label')
    box.append(sub)
  }
  return box
}

/**
 * The Continue card: the project the user was last in, previewed large
 * and directly under the title so it sits in the phone's thumb zone.
 *
 * The whole card is the click target rather than a "Continue" pill
 * inside it — a button nested in a button has no sane keyboard or
 * touch behaviour. The accent-coloured "Continue" label keeps the
 * affordance the design asked for.
 */
export function buildContinueCard(recent: RecentProjectEntry, onContinue: (path: string) => void): Gtk.Button {
  const card = new Gtk.Button({ css_classes: ['card'] })
  const body = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 })

  body.append(buildPreview(recent.path, CONTINUE_PREVIEW_HEIGHT))

  const footer = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12,
    margin_top: 12,
    margin_bottom: 12,
    margin_start: 14,
    margin_end: 14,
  })
  footer.append(buildTitleBlock(recent.name, recent.caption))

  const cta = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, valign: Gtk.Align.CENTER })
  const ctaLabel = new Gtk.Label({ label: _('Continue') })
  ctaLabel.add_css_class('heading')
  ctaLabel.add_css_class('accent')
  cta.append(ctaLabel)
  cta.append(new Gtk.Image({ icon_name: 'go-next-symbolic', pixel_size: 12 }))
  footer.append(cta)

  body.append(footer)
  card.set_child(body)
  card.connect('clicked', () => onContinue(recent.path))
  return card
}

/**
 * A "Start something new" card. The example template shows its first
 * map; the blank one has no tiles to show, so it is a dashed outline
 * with a plus (REDESIGN § 4.1) — and it starts the *New game* flow,
 * which scaffolds a copy into a folder the user picks, rather than
 * opening `games/blank-starter` in place.
 */
export function buildTemplateCard(template: ProjectTemplate, onPick: (template: ProjectTemplate) => void): Gtk.Button {
  const blank = template.isBlank === true
  const card = new Gtk.Button({
    css_classes: blank ? ['flat', 'welcome-add-card'] : ['card'],
    hexpand: true,
  })
  card.set_size_request(TEMPLATE_CARD_WIDTH, -1)

  const body = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    margin_top: 10,
    margin_bottom: 10,
    margin_start: 10,
    margin_end: 10,
  })

  if (blank) {
    const plus = new Gtk.Image({
      icon_name: 'list-add-symbolic',
      pixel_size: 32,
      height_request: TEMPLATE_PREVIEW_HEIGHT,
      valign: Gtk.Align.CENTER,
    })
    plus.add_css_class('dim-label')
    body.append(plus)
  } else {
    body.append(buildPreview(template.projectPath, TEMPLATE_PREVIEW_HEIGHT, template.accentColor))
  }

  body.append(buildTitleBlock(_(template.name), template.caption ? _(template.caption) : ''))
  card.set_child(body)
  card.connect('clicked', () => onPick(template))
  return card
}
