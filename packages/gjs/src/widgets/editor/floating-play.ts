import Adw from '@girs/adw-1'
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
    this._fab.iconName = value ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic'
    this._fab.label = value ? _('Pause') : _('Play')
    this._fab.tooltipText = value ? _('Pause playtest') : _('Play')
    this.notify('playing')
  }
}

GObject.type_ensure(FloatingPlay.$gtype)
