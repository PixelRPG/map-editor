import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import type { EditorTool } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import { TOOL_ICONS } from './brush-badge.geometry.ts'

/** One tool entry: the id the engine knows, its verb, and its accelerator. */
interface ToolEntry {
  id: EditorTool
  label: () => string
  /** The key that arms it, shown in the tooltip. */
  key: string
}

/**
 * The six tools in rail order. The four the phone shows are decision 15
 * of the merged concept: Paint · Fill · Erase · Select. Pick reaches the
 * phone as the long press and the object brush is armed by choosing a
 * Thing, so neither needs a chip there.
 */
const TOOLS: readonly ToolEntry[] = [
  { id: 'select', label: () => _('Select'), key: 'V' },
  { id: 'pencil', label: () => _('Paint'), key: 'B' },
  { id: 'fill', label: () => _('Fill'), key: 'G' },
  { id: 'eraser', label: () => _('Erase'), key: 'E' },
  { id: 'eyedropper', label: () => _('Pick'), key: 'I' },
  { id: 'object', label: () => _('Object'), key: 'O' },
] as const

/** Phone order — Paint first, because the app opens with Paint armed. */
const PHONE_TOOLS: readonly EditorTool[] = ['pencil', 'fill', 'eraser', 'select'] as const

/**
 * The tool chooser: one `Adw.ToggleGroup` that lives in the wide
 * layout's editing pill and, unchanged, in the phone bar's first row.
 *
 * It replaces the six-row labelled rail. Inside an `.osd` pill a checked
 * toggle is a white slab on black, which says "armed" more loudly than
 * the rail's accent fill did, and the badge beside it carries the tool's
 * icon as a second, redundant cue.
 *
 * `active-name` is the single piece of state and the host owns it: the
 * window's `win.set-tool` change-state handler is still the only writer
 * of engine state, so a user click activates the action and the action
 * comes back through {@link setActiveTool}. `_echo` guards the round
 * trip so a programmatic write never re-dispatches.
 */
export class ToolGroup extends Adw.Bin {
  private _group: Adw.ToggleGroup
  private _phone = false
  private _showLabels = false
  private _activeTool: EditorTool = 'select'
  private _echo = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgToolGroup',
        Properties: {
          phone: GObject.ParamSpec.boolean(
            'phone',
            'Phone',
            'Show the four phone tools (Paint, Fill, Erase, Select) instead of all six',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'show-labels': GObject.ParamSpec.boolean(
            'show-labels',
            'Show Labels',
            'Put the tool verb beside each icon (roomy widths only)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      ToolGroup,
    )
  }

  constructor() {
    super()
    this._group = new Adw.ToggleGroup({ homogeneous: true, can_shrink: false })
    // NOT `.flat`, although the design's widget spec says so: inside an
    // `.osd` toolbar libadwaita gives a checked toggle
    // `--active-toggle-bg-color: white`
    // (`refs/libadwaita/src/stylesheet/widgets/_toggle-group.scss`
    // `&.osd, .osd &`), and that white slab on black is the whole reason
    // the design could delete the labelled tool rail — it is a stronger
    // "armed" cue than the rail's accent fill. The `.flat` variant of the
    // same file overrides it back to `$selected_color`, a low-alpha tint:
    // measured over the 70 %-black pill it renders rgb(55,61,36) against
    // the pill's rgb(35,42,14), luminance 58 vs 38, where the design's own
    // acceptance probe D6 asks for > 200 vs < 70. The two clauses cannot
    // both hold, so the reason wins over the letter.
    this.set_child(this._group)
    this._rebuild()
    this._group.connect('notify::active-name', () => this._onActiveNameChanged())
  }

  get phone(): boolean {
    return this._phone ?? false
  }

  set phone(value: boolean) {
    if (this._phone === value) return
    this._phone = value
    this._rebuild()
    this.notify('phone')
  }

  get showLabels(): boolean {
    return this._showLabels ?? false
  }

  set showLabels(value: boolean) {
    if (this._showLabels === value) return
    this._showLabels = value
    this._applyLabels()
    this.notify('show-labels')
  }

  /** The tools this group currently offers, in display order. */
  get tools(): readonly EditorTool[] {
    return this._entries().map((entry) => entry.id)
  }

  /**
   * Check the toggle for `tool`, without dispatching `win.set-tool`.
   * The host calls this from the action's change-state handler, so the
   * action stays the single source of truth.
   *
   * A tool the current set does not offer (Pick or Object while the
   * phone set is shown) clears the check rather than arming the wrong
   * one — the badge still names it.
   */
  setActiveTool(tool: EditorTool): void {
    this._activeTool = tool
    this._echo = true
    try {
      this._group.set_active_name(this.tools.includes(tool) ? tool : null)
    } finally {
      this._echo = false
    }
  }

  private _entries(): ToolEntry[] {
    if (!this._phone) return [...TOOLS]
    return PHONE_TOOLS.map((id) => TOOLS.find((tool) => tool.id === id)).filter((tool): tool is ToolEntry => !!tool)
  }

  private _rebuild(): void {
    this._group.remove_all()
    for (const entry of this._entries()) {
      const toggle = new Adw.Toggle({
        name: entry.id,
        icon_name: TOOL_ICONS[entry.id],
        tooltip: `${entry.label()} (${entry.key})`,
      })
      if (this._showLabels) toggle.set_label(entry.label())
      this._group.add(toggle)
    }
    this.setActiveTool(this._activeTool)
  }

  private _applyLabels(): void {
    for (const entry of this._entries()) {
      const toggle = this._group.get_toggle_by_name(entry.id)
      // `null` is what turns an image-text-button back into an icon-only
      // one; the empty string would leave an empty label box behind.
      toggle?.set_label(this._showLabels ? entry.label() : null)
    }
  }

  private _onActiveNameChanged(): void {
    if (this._echo) return
    const name = this._group.get_active_name()
    if (!name || name === this._activeTool) return
    this.activate_action('win.set-tool', GLib.Variant.new_string(name))
  }
}

GObject.type_ensure(ToolGroup.$gtype)
