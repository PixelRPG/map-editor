import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import { gettext as _ } from 'gettext'

import { FloatingFab } from '../common/floating-fab'

import Template from './floating-play.blp'

// `$PixelRpgFloatingFab` is referenced from the .blp; ensure it's
// registered before the template is parsed.
GObject.type_ensure(FloatingFab.$gtype)

/**
 * Bottom-right floating "Play" pill — the editor's primary Call-to-
 * Action over the canvas overlay.
 *
 * Composes the shared {@link FloatingFab} and adds a single piece of
 * state: `playing`. Toggling that property swaps icon + label +
 * tooltip on the underlying FAB so the user knows clicking again will
 * exit playtest. ApplicationWindow flips `playing` from the `win.play`
 * action's change-state handler.
 */
export class FloatingPlay extends Adw.Bin {
  declare _fab: FloatingFab

  private _playing = false
  private _showMenu = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgFloatingPlay',
        Template,
        InternalChildren: ['fab'],
        Properties: {
          playing: GObject.ParamSpec.boolean(
            'playing',
            'Playing',
            'Whether the editor is currently in runtime / playtest mode',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'show-menu': GObject.ParamSpec.boolean(
            'show-menu',
            'Show menu',
            'Whether the Full-view split menu (Play from start, …) is offered',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      FloatingPlay,
    )
  }

  get playing(): boolean {
    return this._playing
  }

  set playing(value: boolean) {
    if (this._playing === value) return
    this._playing = value
    // Stop, not Pause: the runtime has one exit and it returns to
    // editing (concept §2.5 — the child sees Play / Stop, and Restart
    // beside Stop while a run is going). "Pause" promised a resume the
    // action never had.
    this._fab.iconName = value ? 'media-playback-stop-symbolic' : 'media-playback-start-symbolic'
    this._fab.label = value ? _('Stop') : _('Play')
    this._fab.tooltipText = value ? _('Stop the playtest') : _('Play')
    // The menu is about starting a run; while one is going the arrow
    // would offer nothing the Stop button does not already cover.
    this._fab.showMenu = this._showMenu && !value
    this.notify('playing')
  }

  get showMenu(): boolean {
    return this._showMenu ?? false
  }

  /**
   * Full view turns the FAB into a split button whose menu holds the
   * ways to play that are not "run this map from here". Simple view
   * never sees the arrow — concept §2.5.
   */
  set showMenu(value: boolean) {
    if (this._showMenu === value) return
    this._showMenu = value
    if (value && !this._fab.menuModel) this._fab.menuModel = buildPlayMenu()
    this._fab.showMenu = value && !this._playing
    this.notify('show-menu')
  }
}

/** The Full-view play menu. `win.play-from-start` clears the save first. */
function buildPlayMenu(): Gio.Menu {
  const menu = new Gio.Menu()
  menu.append(_('Play from start'), 'win.play-from-start')
  return menu
}

GObject.type_ensure(FloatingPlay.$gtype)
