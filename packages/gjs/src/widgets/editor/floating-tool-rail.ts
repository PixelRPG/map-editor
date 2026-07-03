import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { EditorTool } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

/**
 * One tool entry in the rail. `group` splits the paint tools from the
 * inspection/placement tools with a separator, matching the design's
 * grouped rail. Order here drives rail order.
 */
interface ToolEntry {
  id: EditorTool
  icon: string
  label: () => string
  group: 'paint' | 'inspect'
}

// Labels are the design's short verbs. `color-fill-symbolic` is a
// bundled app icon (apps/maker-gjs/data/icons) — the system Adwaita
// theme has no bucket-fill glyph.
const TOOLS: ToolEntry[] = [
  { id: 'select', icon: 'edit-select-symbolic', label: () => _('Select'), group: 'paint' },
  { id: 'pencil', icon: 'document-edit-symbolic', label: () => _('Paint'), group: 'paint' },
  { id: 'fill', icon: 'color-fill-symbolic', label: () => _('Fill'), group: 'paint' },
  { id: 'eraser', icon: 'edit-clear-all-symbolic', label: () => _('Erase'), group: 'paint' },
  { id: 'eyedropper', icon: 'color-select-symbolic', label: () => _('Pick'), group: 'inspect' },
  { id: 'object', icon: 'view-grid-symbolic', label: () => _('Object'), group: 'inspect' },
]

/**
 * Vertical, **labelled** tool rail floating on the left edge of the
 * scene editor — the design's answer to "tools were icon-only and hard
 * to discover". Each entry is an icon + text button bound to the
 * `win.set-tool` action (string target); the active tool is highlighted
 * via {@link setActiveTool}, which the host drives from the action's
 * change-state handler (single source of truth — the buttons never set
 * their own active class on click).
 */
export class FloatingToolRail extends Adw.Bin {
  private _buttons = new Map<EditorTool, Gtk.Button>()

  static {
    GObject.registerClass({ GTypeName: 'PixelRpgFloatingToolRail' }, FloatingToolRail)
  }

  constructor() {
    super()
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 })
    box.add_css_class('toolbar')
    box.add_css_class('osd')

    let prevGroup: ToolEntry['group'] | null = null
    for (const tool of TOOLS) {
      if (prevGroup && tool.group !== prevGroup) {
        box.append(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL }))
      }
      prevGroup = tool.group
      box.append(this._buildButton(tool))
    }
    this.set_child(box)
  }

  private _buildButton(tool: ToolEntry): Gtk.Button {
    const button = new Gtk.Button({ css_classes: ['flat', 'tool-rail-button'], tooltip_text: tool.label() })
    // String-target detailed action → routes through the same
    // `win.set-tool` change-state handler as the old popover.
    button.set_detailed_action_name(`win.set-tool::${tool.id}`)
    const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 })
    row.append(new Gtk.Image({ icon_name: tool.icon }))
    row.append(new Gtk.Label({ label: tool.label(), halign: Gtk.Align.START, hexpand: true }))
    button.set_child(row)
    this._buttons.set(tool.id, button)
    return button
  }

  /** Highlight the button for `tool` (accent), clearing the others. */
  setActiveTool(tool: EditorTool): void {
    for (const [id, button] of this._buttons) {
      // Custom class, not `.suggested-action`: the latter is visually
      // muted inside an `.osd` toolbar. `.active-tool` (scene-editor.css)
      // paints an explicit accent fill.
      if (id === tool) button.add_css_class('active-tool')
      else button.remove_css_class('active-tool')
    }
  }
}

GObject.type_ensure(FloatingToolRail.$gtype)
