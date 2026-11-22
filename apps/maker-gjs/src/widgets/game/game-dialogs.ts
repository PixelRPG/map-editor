import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { type GameProjectResource, localesToAdd } from '@pixelrpg/engine'
import { MapPreview } from '@pixelrpg/gjs'
import { gettext as _, ngettext } from 'gettext'

import type { GameRuleRow } from '../../services/game-rules-model.ts'

/**
 * The Game page's dialogs — the start-map picker, the hero picker and
 * the one confirmation the Rules group needs.
 *
 * Built imperatively like `world/map-dialogs.ts` and
 * `objects/new-thing-dialog.ts`: each is a throwaway form with no state
 * to keep between presentations.
 */

/**
 * Side length of a map row's thumbnail, in px — the same square the
 * atlas list and the door-target picker use, so every list of maps in
 * the app looks like one thing.
 */
const THUMB_PX = 56

/** Smallest size a picker gets; the list scrolls inside it. */
const DIALOG_WIDTH = 360
const DIALOG_HEIGHT = 480

/** One map the game could start on. */
export interface StartMapOption {
  readonly id: string
  readonly name: string
}

/** One character who could be the hero. */
export interface HeroOption {
  readonly id: string
  readonly name: string
}

/**
 * Present the start-map picker (REDESIGN.md § 4.5 "Start"): the
 * project's maps with thumbnails, the current one ticked. The row IS the
 * choice, so there is no confirm button — picking a start map is a
 * one-field edit that undoes by picking another.
 */
export function presentStartMapDialog(
  parent: Gtk.Widget,
  options: {
    readonly maps: readonly StartMapOption[]
    readonly projectResource: GameProjectResource | null
    readonly currentMapId: string | null
  },
  onChoose: (mapId: string) => void,
): void {
  const group = new Adw.PreferencesGroup({ title: _('Start map') })
  if (options.maps.length === 0) {
    group.set_description(_('This project has no map yet.'))
  } else {
    group.set_description(_('The map the hero wakes up on.'))
  }
  // Built before the rows so their handlers can close it — the rows go
  // into the group after it is already inside the page, which libadwaita
  // is happy with.
  const dialog = pickerDialog(_('Start map'), group)
  for (const map of options.maps) {
    const row = pickerRow(map.name, map.id === options.currentMapId)
    row.add_prefix(mapThumbnail(map.id, options.projectResource))
    row.connect('activated', () => {
      dialog.close()
      onChoose(map.id)
    })
    group.add(row)
  }
  dialog.present(parent)
}

/**
 * Present the hero picker: the project's characters, the current hero
 * ticked. Only a pick — there is deliberately no "nobody" row, because a
 * game without a hero cannot run and the Checkup already says so.
 */
export function presentHeroDialog(
  parent: Gtk.Widget,
  options: {
    readonly characters: readonly HeroOption[]
    readonly currentHeroId: string | null
  },
  onChoose: (characterId: string) => void,
): void {
  const group = new Adw.PreferencesGroup({ title: _('Hero') })
  if (options.characters.length === 0) {
    group.set_description(_('This project has no character yet.'))
  } else {
    group.set_description(_('The character the player moves around.'))
  }
  const dialog = pickerDialog(_('Hero'), group)
  for (const character of options.characters) {
    const row = pickerRow(character.name, character.id === options.currentHeroId)
    row.add_prefix(new Gtk.Image({ iconName: 'avatar-default-symbolic', valign: Gtk.Align.CENTER }))
    row.connect('activated', () => {
      dialog.close()
      onChoose(character.id)
    })
    group.add(row)
  }
  dialog.present(parent)
}

/**
 * Present the "Add a language" picker: the hand-written locale list,
 * minus what the game already has, each named in its own language. The
 * row IS the choice, so there is no confirm button — adding a language
 * undoes by removing it.
 */
export function presentLanguagePicker(
  parent: Gtk.Widget,
  taken: readonly string[],
  onChoose: (code: string) => void,
): void {
  const group = new Adw.PreferencesGroup({ title: _('Add a language') })
  const dialog = pickerDialog(_('Add a language'), group)
  for (const locale of localesToAdd(taken)) {
    const row = pickerRow(locale.endonym, false)
    row.connect('activated', () => {
      dialog.close()
      onChoose(locale.code)
    })
    group.add(row)
  }
  dialog.present(parent)
}

/** What a tap on a non-default language row can decide. */
export type LanguageChoice = 'make-default' | 'remove'

/**
 * What to do with one non-default language: make it the default, or
 * remove it. Removing while texts exist in it asks once more, saying
 * out loud that the words stay in the game's files.
 */
export function presentLanguageDialog(
  parent: Gtk.Widget,
  options: { readonly label: string; readonly hasText: boolean },
  onChoose: (choice: LanguageChoice) => void,
): void {
  const dialog = new Adw.AlertDialog({ heading: options.label })
  dialog.add_response('cancel', _('Cancel'))
  dialog.add_response('make-default', _('Make default'))
  dialog.add_response('remove', _('Remove'))
  dialog.set_response_appearance('remove', Adw.ResponseAppearance.DESTRUCTIVE)
  dialog.set_default_response('cancel')
  dialog.set_close_response('cancel')
  dialog.connect('response', (_d: Adw.AlertDialog, response: string) => {
    if (response === 'make-default') onChoose('make-default')
    else if (response === 'remove') {
      if (options.hasText) confirmLanguageRemoval(parent, options.label, () => onChoose('remove'))
      else onChoose('remove')
    }
  })
  dialog.present(parent)
}

function confirmLanguageRemoval(parent: Gtk.Widget, label: string, onConfirmed: () => void): void {
  const dialog = new Adw.AlertDialog({
    heading: _('Remove %s?').replace('%s', label),
    body: _('Words written in it stay in your game files, but nobody sees them until you add the language again.'),
  })
  dialog.add_response('cancel', _('Cancel'))
  dialog.add_response('remove', _('Remove'))
  dialog.set_response_appearance('remove', Adw.ResponseAppearance.DESTRUCTIVE)
  dialog.set_default_response('cancel')
  dialog.set_close_response('cancel')
  dialog.connect('response', (_d: Adw.AlertDialog, response: string) => {
    if (response === 'remove') onConfirmed()
  })
  dialog.present(parent)
}

/**
 * Confirm switching a game system OFF while the project uses it.
 *
 * Not a destructive confirmation: switching off is dormant, so the
 * dialog's whole job is to say that out loud — nothing is deleted, the
 * settings stay on disk, and the only change is that they stop doing
 * anything. Switching a system off that nothing uses asks nothing at
 * all; the caller skips this dialog entirely.
 */
export function confirmRuleSwitchOff(
  parent: Gtk.Widget,
  rule: GameRuleRow,
  onDecided: (confirmed: boolean) => void,
): void {
  const dialog = new Adw.AlertDialog({
    heading: _('Turn off %s?').replace('%s', rule.label),
    body: `${describeDormantUsage(rule)} ${_('Nothing is deleted — their settings stay, and start working again the moment you turn this back on.')}`,
  })
  dialog.add_response('cancel', _('Cancel'))
  dialog.add_response('turn-off', _('Turn off'))
  dialog.set_default_response('cancel')
  dialog.set_close_response('cancel')
  dialog.connect('response', (_d: Adw.AlertDialog, response: string) => onDecided(response === 'turn-off'))
  dialog.present(parent)
}

/**
 * "3 objects stop using it, 12 of them placed on 2 maps." — the honest
 * count, because "they keep their settings" is only reassuring when the
 * number next to it is right.
 */
function describeDormantUsage(rule: GameRuleRow): string {
  const { entities, placements, maps } = rule.usage
  const objects = ngettext('%d object stops using it.', '%d objects stop using it.', entities).replace(
    '%d',
    String(entities),
  )
  if (placements === 0) return objects
  // Concatenated rather than one msgid with three placeholders: each
  // part pluralises on a different number.
  const placed = ngettext('%d of them is placed', '%d of them are placed', placements).replace('%d', String(placements))
  const onMaps = ngettext('on %d map.', 'on %d maps.', maps).replace('%d', String(maps))
  return `${objects} ${placed} ${onMaps}`
}

/** A pickable row: the name, and a tick when it is the current choice. */
function pickerRow(name: string, current: boolean): Adw.ActionRow {
  const row = new Adw.ActionRow({
    title: name,
    // Map and character names are user data — see `door-target-dialog.ts`.
    useMarkup: false,
    activatable: true,
  })
  if (current) row.add_suffix(new Gtk.Image({ iconName: 'object-select-symbolic', valign: Gtk.Align.CENTER }))
  return row
}

/** The shared shell both pickers present: a header bar over one group. */
function pickerDialog(title: string, group: Adw.PreferencesGroup): Adw.Dialog {
  const page = new Adw.PreferencesPage()
  page.add(group)
  const view = new Adw.ToolbarView({ content: page })
  view.add_top_bar(new Adw.HeaderBar())
  const dialog = new Adw.Dialog({ title, contentWidth: DIALOG_WIDTH, contentHeight: DIALOG_HEIGHT })
  dialog.set_child(view)
  return dialog
}

/**
 * A row's map thumbnail — the project's real tiles, or a map icon when
 * the resource holds no map under that id. `MapPreview` fits the whole
 * map into the square itself.
 */
function mapThumbnail(mapId: string, projectResource: GameProjectResource | null): Gtk.Widget {
  const bin = new Adw.Bin({
    widthRequest: THUMB_PX,
    heightRequest: THUMB_PX,
    valign: Gtk.Align.CENTER,
    overflow: Gtk.Overflow.HIDDEN,
  })
  if (projectResource?.maps.get(mapId)) {
    const preview = new MapPreview()
    bin.child = preview
    void preview.setFromResource(projectResource, mapId)
    return bin
  }
  bin.child = new Gtk.Image({ iconName: 'map-symbolic', pixelSize: 24 })
  return bin
}
