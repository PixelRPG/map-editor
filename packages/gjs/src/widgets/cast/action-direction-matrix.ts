import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { type CharacterAnimation, type CharacterDefinition, REQUIRED_ROLES } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import type { GdkSpriteSetResource } from '../../sprite/index.ts'

/** Actions (rows) and directions (columns) parsed out of the `<state>-<direction>` role ids. */
const ACTIONS = ['idle', 'walk'] as const
const DIRECTIONS: { id: string; glyph: string; label: () => string }[] = [
  { id: 'up', glyph: '↑', label: () => _('Up') },
  { id: 'down', glyph: '↓', label: () => _('Down') },
  { id: 'left', glyph: '←', label: () => _('Left') },
  { id: 'right', glyph: '→', label: () => _('Right') },
]
const CELL_THUMB = 48

/**
 * Action×Direction animation matrix — the design's replacement for the
 * flat 8-row {@link AnimationList} (soll-character). A `Gtk.Grid` with a
 * direction header row and one row per action (Idle / Walk); every cell
 * previews the role's first frame + its "N frames · Σms" and marks the
 * required roles filled at a glance ("✓ 8/8").
 *
 * Reuses {@link AnimationList}'s signal vocabulary so it is a drop-in in
 * the host wiring:
 * - `animation-selected(id)` — single click (drives the live preview)
 * - `edit-animation-requested(id)` — double click (opens the frame editor)
 * - `add-animation-requested` — the "Add custom animation…" button
 * - `delete-animation-requested(id)` — a custom animation's trash button
 */
export class ActionDirectionMatrix extends Adw.Bin {
  private _character: CharacterDefinition | null = null
  private _spriteSet: GdkSpriteSetResource | null = null
  private _activeId: string | null = null
  private _cellsById = new Map<string, Gtk.Widget>()

  private _grid = new Gtk.Grid({ columnSpacing: 8, rowSpacing: 8, columnHomogeneous: true })
  private _statusPill = new Gtk.Label({ cssClasses: ['caption-heading'] })
  private _customBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgActionDirectionMatrix',
        Signals: {
          'animation-selected': { param_types: [GObject.TYPE_STRING] },
          'edit-animation-requested': { param_types: [GObject.TYPE_STRING] },
          'add-animation-requested': {},
          'delete-animation-requested': { param_types: [GObject.TYPE_STRING] },
        },
      },
      ActionDirectionMatrix,
    )
  }

  constructor() {
    super()
    const root = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12 })

    const header = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 })
    header.append(
      new Gtk.Label({ label: _('Animations'), halign: Gtk.Align.START, hexpand: true, cssClasses: ['title-4'] }),
    )
    header.append(this._statusPill)
    root.append(header)

    const hint = new Gtk.Label({
      label: _('Click a cell to preview · double-click to edit its frames.'),
      halign: Gtk.Align.START,
      cssClasses: ['caption', 'dim-label'],
    })
    root.append(hint)

    root.append(this._grid)

    root.append(
      new Gtk.Label({
        label: _('Custom'),
        halign: Gtk.Align.START,
        marginTop: 6,
        cssClasses: ['caption-heading', 'dim-label'],
      }),
    )
    root.append(this._customBox)

    const addButton = new Gtk.Button({
      label: _('Add custom animation…'),
      cssClasses: ['flat', 'anim-matrix-add'],
      halign: Gtk.Align.START,
    })
    addButton.connect('clicked', () => this.emit('add-animation-requested'))
    root.append(addButton)

    this.set_child(root)
    this._buildGridSkeleton()
  }

  /** Populate from a character + its (sheet-owned) animations. */
  setCharacter(character: CharacterDefinition | null, spriteSet: GdkSpriteSetResource | null = null): void {
    this._character = character
    this._spriteSet = spriteSet
    this._rebuild()
  }

  /** Refresh after the host mutated the underlying animations. */
  refresh(): void {
    this._rebuild()
  }

  /** External selection sync (from the preview) — highlight only, no signal. */
  setActiveAnimation(animId: string | null): void {
    if (this._activeId === animId) return
    this._activeId = animId
    this._applyHighlight()
  }

  private _buildGridSkeleton(): void {
    // Header row: empty corner + direction labels.
    this._grid.attach(new Gtk.Label({ label: '' }), 0, 0, 1, 1)
    DIRECTIONS.forEach((d, i) => {
      const label = new Gtk.Label({
        label: `${d.glyph} ${d.label()}`,
        cssClasses: ['caption-heading', 'dim-label'],
      })
      this._grid.attach(label, i + 1, 0, 1, 1)
    })
    // Action rows: label + one cell button per direction.
    ACTIONS.forEach((action, r) => {
      const rowLabel = new Gtk.Label({
        label: this._actionLabel(action),
        halign: Gtk.Align.START,
        cssClasses: ['heading'],
      })
      this._grid.attach(rowLabel, 0, r + 1, 1, 1)
      DIRECTIONS.forEach((d, c) => {
        const roleId = `${action}-${d.id}`
        const cell = this._buildCell(roleId)
        this._cellsById.set(roleId, cell)
        this._grid.attach(cell, c + 1, r + 1, 1, 1)
      })
    })
  }

  private _actionLabel(action: (typeof ACTIONS)[number]): string {
    return action === 'idle' ? _('Idle') : _('Walk')
  }

  private _buildCell(roleId: string): Gtk.Widget {
    // A plain box (not a GtkButton) so a single GestureClick reliably
    // sees both click depths — a button's own gesture would claim the
    // sequence and swallow the double-click. Single click = select
    // (preview), double click = open the frame editor.
    const cell = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      cssClasses: ['anim-matrix-cell'],
      focusable: true,
    })
    const click = new Gtk.GestureClick()
    click.set_button(1)
    click.connect('released', (_g, nPress) => {
      if (nPress >= 2) this.emit('edit-animation-requested', roleId)
      else this.emit('animation-selected', roleId)
    })
    cell.add_controller(click)
    return cell
  }

  private _animations(): CharacterAnimation[] {
    if (!this._character) return []
    return this._spriteSet?.data?.characterAnimations ?? this._character.animations ?? []
  }

  private _rebuild(): void {
    const anims = this._animations()
    const byId = new Map(anims.map((a) => [a.id, a]))

    // Fill each required-role cell.
    let filled = 0
    for (const [roleId, cell] of this._cellsById) {
      const anim = byId.get(roleId) ?? null
      if (anim && anim.frames.length > 0) filled++
      const box = cell as Gtk.Box
      let child = box.get_first_child()
      while (child) {
        const next = child.get_next_sibling()
        box.remove(child)
        child = next
      }
      box.append(this._cellContent(anim))
    }

    // Status pill — required-role coverage.
    const total = REQUIRED_ROLES.length
    this._statusPill.set_label(_('✓ %d/%d roles filled').replace('%d', String(filled)).replace('%d', String(total)))
    this._statusPill.remove_css_class('success')
    this._statusPill.remove_css_class('warning')
    this._statusPill.add_css_class(filled === total ? 'success' : 'warning')

    // Custom animations (non-role).
    let customChild = this._customBox.get_first_child()
    while (customChild) {
      const next = customChild.get_next_sibling()
      this._customBox.remove(customChild)
      customChild = next
    }
    const customAnims = anims
      .filter((a) => !REQUIRED_ROLES.includes(a.id as (typeof REQUIRED_ROLES)[number]))
      .sort((a, b) => a.id.localeCompare(b.id))
    for (const anim of customAnims) this._customBox.append(this._buildCustomRow(anim))

    this._applyHighlight()
  }

  private _cellContent(anim: CharacterAnimation | null): Gtk.Widget {
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, marginTop: 6, marginBottom: 6 })
    const thumb = new Gtk.Picture({
      contentFit: Gtk.ContentFit.CONTAIN,
      widthRequest: CELL_THUMB,
      heightRequest: CELL_THUMB,
      halign: Gtk.Align.CENTER,
    })
    if (anim && anim.frames.length > 0 && this._spriteSet) {
      const sprite = this._spriteSet.getSprite(anim.frames[0].spriteId)
      thumb.set_paintable(sprite?.createPaintable({ keepAspectRatio: true }) ?? null)
    }
    box.append(thumb)
    const caption = anim
      ? _('%n frames · %m ms')
          .replace('%n', String(anim.frames.length))
          .replace('%m', String(anim.frames.reduce((s, f) => s + f.duration, 0)))
      : _('Empty')
    box.append(new Gtk.Label({ label: caption, cssClasses: ['caption', 'dim-label'] }))
    return box
  }

  private _buildCustomRow(anim: CharacterAnimation): Gtk.Box {
    const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    const button = new Gtk.Button({ label: anim.id, cssClasses: ['flat'], hexpand: true, halign: Gtk.Align.START })
    button.connect('clicked', () => this.emit('animation-selected', anim.id))
    const editClick = new Gtk.GestureClick()
    editClick.connect('released', (_g, nPress) => {
      if (nPress >= 2) this.emit('edit-animation-requested', anim.id)
    })
    button.add_controller(editClick)
    row.append(button)
    const del = new Gtk.Button({
      iconName: 'user-trash-symbolic',
      cssClasses: ['flat', 'circular'],
      valign: Gtk.Align.CENTER,
      tooltipText: _('Delete animation'),
    })
    del.connect('clicked', () => this.emit('delete-animation-requested', anim.id))
    row.append(del)
    return row
  }

  private _applyHighlight(): void {
    for (const [id, cell] of this._cellsById) {
      if (id === this._activeId) cell.add_css_class('active-cell')
      else cell.remove_css_class('active-cell')
    }
  }
}

GObject.type_ensure(ActionDirectionMatrix.$gtype)
