import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { StoryArgs, StoryMeta } from '../types/story'

export namespace StoryWidget {
  export interface ConstructorProps {
    meta: StoryMeta
    story: string
    args: StoryArgs
  }
}

/**
 * Base class for GJS story widgets.
 *
 * Provides a default chrome — a centered `Adw.PreferencesPage` /
 * `Adw.PreferencesGroup` with title + description above a content slot —
 * built programmatically (no `Template`). This lets simple stories
 * compose their preview by calling {@link addContent}, while still
 * allowing more elaborate subclasses to override the layout by
 * providing their own composite template.
 *
 * Subclasses that DO provide a `Template` have full control over the
 * layout; {@link addContent} is a no-op for them (no `_story_content`
 * slot is created).
 */
export class StoryWidget extends Adw.Bin {
  private _meta!: StoryMeta
  private _story = ''
  private _args!: StoryArgs

  private _storyContent: Gtk.Box | null = null
  private _group: Adw.PreferencesGroup | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'StoryWidget',
        Properties: {
          meta: GObject.ParamSpec.object(
            'meta',
            'Meta',
            'Story metadata',
            GObject.ParamFlags.READWRITE,
            GObject.Object,
          ),
          story: GObject.ParamSpec.string('story', 'Story Name', 'Story name', GObject.ParamFlags.READWRITE, ''),
          args: GObject.ParamSpec.object(
            'args',
            'Args',
            'Story arguments',
            GObject.ParamFlags.READWRITE,
            GObject.Object,
          ),
        },
      },
      StoryWidget,
    )
  }

  constructor(params: StoryWidget.ConstructorProps, adwParams: Partial<Adw.Bin.ConstructorProps> = {}) {
    super(adwParams)

    this._meta = params.meta
    this._story = params.story
    this._args = params.args

    if (this.get_child() == null) this._installDefaultChrome()
  }

  get meta(): StoryMeta {
    return this._meta
  }

  set meta(value: StoryMeta) {
    if (this._meta === value) return
    this._meta = value
    this.notify('meta')
    this._refreshChromeText()
  }

  get story(): string {
    return this._story
  }

  set story(value: string) {
    if (this._story === value) return
    this._story = value
    this.notify('story')
    this._refreshChromeText()
  }

  get args(): StoryArgs {
    return this._args
  }

  set args(value: StoryArgs) {
    if (this._args === value) return
    this._args = value
    this.notify('args')
    this.updateArgs(value)
  }

  /** Override in subclasses. */
  initialize(): void {}

  /** Override in subclasses. */
  updateArgs(_args: StoryArgs): void {}

  /**
   * Add a widget to the default story preview slot. No-op if the
   * subclass installed its own composite template.
   */
  addContent(widget: Gtk.Widget): void {
    if (!this._storyContent) return

    let child = this._storyContent.get_first_child()
    while (child) {
      child.unparent()
      child = this._storyContent.get_first_child()
    }
    this._storyContent.append(widget)
  }

  private _installDefaultChrome(): void {
    const page = new Adw.PreferencesPage()
    const group = new Adw.PreferencesGroup()
    const content = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      halign: Gtk.Align.CENTER,
      valign: Gtk.Align.CENTER,
      margin_top: 12,
      margin_bottom: 12,
      spacing: 12,
      hexpand: true,
    })

    group.add(content)
    page.add(group)
    this.set_child(page)

    this._group = group
    this._storyContent = content
    this._refreshChromeText()
  }

  private _refreshChromeText(): void {
    if (!this._group) return
    const title = this._meta ? (this._story ? `${this._meta.title} — ${this._story}` : this._meta.title) : this._story
    const description = this._meta?.description ?? ''
    this._group.set_title(title)
    this._group.set_description(description)
  }
}

GObject.type_ensure(StoryWidget.$gtype)
