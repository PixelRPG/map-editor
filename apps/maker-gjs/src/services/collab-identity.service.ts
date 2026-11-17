import GLib from '@girs/glib-2.0'
import type Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import { gettext as _ } from 'gettext'

import { lookupAppSettings } from './app-settings.ts'
import { coerceCollabColour, coerceDisplayName, defaultDisplayName } from './collab-identity.ts'
import { colourForPeer } from './collab-peer-colour.ts'

/**
 * Owns the *Together* preferences (REDESIGN.md § 4.8): the name and
 * colour this user shows up as, whether the session is advertised on the
 * local network, and whether the AI collaborator takes part.
 *
 * Same shape as {@link ThemeService} / `UiTierService` — GSettings when a
 * schema is installed, non-persistent in-memory values with a warning
 * when it is not, and GObject properties so the Preferences rows, the
 * Together dialog and the session wiring all follow one value through
 * `notify::`.
 *
 * The defaults are *derived, not stored*: an empty `collab-name` means
 * "whatever the system calls me", an empty `collab-colour` means "the
 * peerId hash every build before 8.1 used". Storing the derived value on
 * first run instead would freeze a machine's login name into the
 * settings of a user who never chose it.
 */
export class CollabIdentityService extends GObject.Object {
  static {
    GObject.registerClass(
      {
        GTypeName: 'CollabIdentityService',
        Properties: {
          'display-name': GObject.ParamSpec.string(
            'display-name',
            'Display name',
            'The name this user appears as to everyone else in a session',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          colour: GObject.ParamSpec.string(
            'colour',
            'Colour',
            "This user's cursor and roster colour, as a #rrggbb token",
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'visible-nearby': GObject.ParamSpec.boolean(
            'visible-nearby',
            'Visible nearby',
            'Whether a hosted session is advertised to devices on the local network',
            GObject.ParamFlags.READWRITE,
            true,
          ),
          'assistant-enabled': GObject.ParamSpec.boolean(
            'assistant-enabled',
            'Assistant enabled',
            'Whether the AI collaborator takes part in editing',
            GObject.ParamFlags.READWRITE,
            true,
          ),
        },
      },
      CollabIdentityService,
    )
  }

  private settings: Gio.Settings | null = null
  /**
   * Values used when no schema is installed. Each setter below only
   * notifies on an actual change, exactly as `Gio.Settings` does: the
   * assistant switch mirrors the `win.toggle-assistant-paused` action
   * both ways, and a setter that notified unconditionally would make
   * that mirror oscillate forever in an unpackaged build.
   */
  private fallback = { name: '', colour: '', nearby: true, assistant: true }

  /**
   * The peer id the colour default is derived from. Set once by the
   * session coordinator, which generates it; before that the default
   * colour falls back to the first palette entry.
   */
  private _peerId = ''

  /** Resolve the backend and start mirroring external writes. Call once at startup. */
  init(settings: Gio.Settings | null = lookupAppSettings()): void {
    this.settings = settings
    if (!settings) {
      console.warn('[CollabIdentityService] No GSettings schema — Together preferences are session-only.')
      return
    }
    settings.connect('changed::collab-name', () => this.notify('display-name'))
    settings.connect('changed::collab-colour', () => this.notify('colour'))
    settings.connect('changed::collab-visible-nearby', () => this.notify('visible-nearby'))
    settings.connect('changed::collab-assistant-enabled', () => this.notify('assistant-enabled'))
  }

  /** Tell the service which peer id to hash when no colour was chosen. */
  setPeerId(peerId: string): void {
    if (this._peerId === peerId) return
    const before = this.colour
    this._peerId = peerId
    if (this.colour !== before) this.notify('colour')
  }

  /** The name to show when the user has never chosen one. */
  get systemDefaultName(): string {
    return defaultDisplayName(GLib.get_real_name(), GLib.get_user_name(), _('You'))
  }

  /** The colour to use when the user has never chosen one. */
  get derivedColour(): string {
    return this._peerId ? colourForPeer(this._peerId) : colourForPeer('')
  }

  get displayName(): string {
    const stored = this.settings?.get_string('collab-name') ?? this.fallback.name
    return coerceDisplayName(stored, this.systemDefaultName)
  }

  set displayName(value: string) {
    // Store the raw-but-coerced text, and store EMPTY when it matches
    // the system default, so a user who never deviates keeps tracking
    // their account name after they rename it.
    const coerced = coerceDisplayName(value, '')
    const next = coerced === this.systemDefaultName ? '' : coerced
    if (this.settings) this.settings.set_string('collab-name', next)
    else if (this.fallback.name !== next) {
      this.fallback.name = next
      this.notify('display-name')
    }
  }

  get colour(): string {
    const stored = this.settings?.get_string('collab-colour') ?? this.fallback.colour
    return coerceCollabColour(stored, this.derivedColour)
  }

  set colour(value: string) {
    const next = coerceCollabColour(value, '')
    if (this.settings) this.settings.set_string('collab-colour', next)
    else if (this.fallback.colour !== next) {
      this.fallback.colour = next
      this.notify('colour')
    }
  }

  get visibleNearby(): boolean {
    return this.settings?.get_boolean('collab-visible-nearby') ?? this.fallback.nearby
  }

  set visibleNearby(value: boolean) {
    if (this.settings) this.settings.set_boolean('collab-visible-nearby', value)
    else if (this.fallback.nearby !== value) {
      this.fallback.nearby = value
      this.notify('visible-nearby')
    }
  }

  get assistantEnabled(): boolean {
    return this.settings?.get_boolean('collab-assistant-enabled') ?? this.fallback.assistant
  }

  set assistantEnabled(value: boolean) {
    if (this.settings) this.settings.set_boolean('collab-assistant-enabled', value)
    else if (this.fallback.assistant !== value) {
      this.fallback.assistant = value
      this.notify('assistant-enabled')
    }
  }
}
