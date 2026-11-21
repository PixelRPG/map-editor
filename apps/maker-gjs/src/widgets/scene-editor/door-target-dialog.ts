import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import type { GameProjectResource } from '@pixelrpg/engine'
import { MapPreview } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

/**
 * Step 1 of the REDESIGN § 6.2 "Goes to" flow: the picker that lists the
 * project's maps with thumbnails. Choosing one opens it in pick mode, so
 * the dialog has no confirm button — the row IS the choice.
 *
 * Built imperatively like `world/map-dialogs.ts`: a throwaway form with
 * no state to keep between presentations.
 */

/**
 * Side length of a row's map thumbnail, in px — the same square the
 * World view's map sidebar uses, so the two lists of maps look like one thing.
 */
const THUMB_PX = 56

/** Smallest size the dialog gets; the list scrolls inside it. */
const DIALOG_WIDTH = 360
const DIALOG_HEIGHT = 480

/** One map the door could lead to. */
export interface DoorTargetMapOption {
  readonly id: string
  readonly name: string
  /** Tile size and anything else worth stating, already translated. */
  readonly subtitle: string
}

/** What the user asked for by tapping a map. */
export interface DoorTargetChoice {
  readonly targetMapId: string
  /** Whether to place the return door once the arrival tile is tapped. */
  readonly addDoorBack: boolean
}

/**
 * Present the map picker for one door.
 *
 * The "Add a door back" switch sits here rather than after the tap,
 * where § 6.2 words it: asking before means the whole flow is one
 * question and one tap, and the person is deciding about the door they
 * are still looking at. It is on by default — a door the hero cannot
 * walk back out of is nearly always a mistake, not a design.
 *
 * The door's own map is NOT filtered out: a staircase between two floors
 * of the same map is a door to itself, and refusing it would be a rule
 * the data does not have.
 */
export function presentDoorTargetDialog(
  parent: Gtk.Widget,
  options: {
    readonly maps: readonly DoorTargetMapOption[]
    readonly projectResource: GameProjectResource | null
    /** The map the door points at today, marked in the list. */
    readonly currentTargetMapId: string | null
  },
  onChoose: (choice: DoorTargetChoice) => void,
): void {
  const dialog = new Adw.Dialog({
    title: _('Goes to'),
    contentWidth: DIALOG_WIDTH,
    contentHeight: DIALOG_HEIGHT,
  })

  const doorBack = new Adw.SwitchRow({
    title: _('Add a door back'),
    subtitle: _('Place a door on the other map that leads back here.'),
    active: true,
  })
  const doorBackGroup = new Adw.PreferencesGroup()
  doorBackGroup.add(doorBack)

  const mapsGroup = new Adw.PreferencesGroup({ title: _('Maps') })
  if (options.maps.length === 0) {
    // Only reachable with a one-map project, and then the honest answer
    // is that there is nowhere to go yet.
    mapsGroup.set_description(_('This project has no other map yet.'))
  }
  for (const map of options.maps) {
    const row = new Adw.ActionRow({
      title: map.name,
      subtitle: map.subtitle,
      // Map names are user data: a map called "Cliffs <of> Doom" must
      // read as itself, not vanish into a broken tag.
      useMarkup: false,
      activatable: true,
    })
    row.add_prefix(thumbnail(map.id, options.projectResource))
    if (map.id === options.currentTargetMapId) {
      row.add_suffix(new Gtk.Image({ iconName: 'object-select-symbolic', valign: Gtk.Align.CENTER }))
    }
    row.connect('activated', () => {
      // Close first: pick mode strips the editor down to its banner, and
      // a dialog still standing over it would hide the map to tap.
      dialog.close()
      onChoose({ targetMapId: map.id, addDoorBack: doorBack.get_active() })
    })
    mapsGroup.add(row)
  }

  const page = new Adw.PreferencesPage()
  page.add(doorBackGroup)
  page.add(mapsGroup)

  const view = new Adw.ToolbarView({ content: page })
  view.add_top_bar(new Adw.HeaderBar())
  dialog.set_child(view)
  dialog.present(parent)
}

/**
 * The row's map thumbnail — the project's real tiles, or a map icon when
 * the resource has no map under that id (a reference the loader could
 * not resolve). `MapPreview` fits the whole map into the square itself.
 */
function thumbnail(mapId: string, projectResource: GameProjectResource | null): Gtk.Widget {
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
