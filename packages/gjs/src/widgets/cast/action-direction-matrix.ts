import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { type CharacterAnimation, type CharacterDefinition, REQUIRED_ROLES } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import type { GdkSpriteSetResource } from '../../sprite/index.ts'
import {
  type CellAction,
  type CellState,
  cellMenuActions,
  cellState,
  cellTapIntent,
  GRID_SPACING,
  gridFits,
} from './animation-cell.model.ts'

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
 * Typed view of the signals {@link ActionDirectionMatrix} registers, layered on the parent's
 * own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface ActionDirectionMatrixSignals extends Adw.Bin.SignalSignatures {
  'animation-selected': (animationId: string) => void
  'edit-animation-requested': (animationId: string) => void
  'add-animation-requested': () => void
  'clear-animation-requested': (animationId: string) => void
}

const CELL_ACTION_LABELS: Record<CellAction, () => string> = {
  edit: () => _('Edit pictures…'),
  play: () => _('Play'),
  clear: () => _('Clear'),
}

/**
 * Action×Direction animation matrix — the design's replacement for the
 * flat 8-row {@link AnimationList} (soll-character). A direction header row
 * and one row per action (Idle / Walk); every cell previews the role's first
 * frame + its "N frames · Σms" and marks the required roles filled at a
 * glance ("✓ 8/8").
 *
 * A filled cell carries a "⋯" menu (Edit pictures… / Play / Clear), an empty
 * one a "+" button; tapping a filled cell previews it, Enter on a focused
 * cell opens the editor. There is deliberately no double-click path.
 *
 * Four direction columns do not fit a phone at a tappable size, so below
 * {@link gridFits} the same cells render as one boxed list per action.
 *
 * Reuses {@link AnimationList}'s signal vocabulary so it is a drop-in in
 * the host wiring:
 * - `animation-selected(id)` — tap or "Play" (drives the live preview)
 * - `edit-animation-requested(id)` — "Edit pictures…", "+", or Enter
 * - `add-animation-requested` — the "Add custom animation…" button
 * - `clear-animation-requested(id)` — "Clear" (the host offers Undo)
 */
export class ActionDirectionMatrix extends Adw.Bin {
  private _character: CharacterDefinition | null = null
  private _spriteSet: GdkSpriteSetResource | null = null
  private _activeId: string | null = null
  private _cellsById = new Map<string, Gtk.Box>()
  private _states = new Map<string, CellState>()
  private _rowsById = new Map<string, Gtk.Widget>()
  private _menuButtons = new Map<string, Gtk.MenuButton[]>()

  private _grid = new Gtk.Grid({ columnSpacing: GRID_SPACING, rowSpacing: GRID_SPACING, columnHomogeneous: true })
  private _lists = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12 })
  private _layout = new Gtk.Stack({ hhomogeneous: false, vhomogeneous: false })
  private _statusPill = new Gtk.Label({ cssClasses: ['caption-heading'] })
  private _customBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8 })
  private _customHeading = new Gtk.Label({
    label: _('Custom'),
    halign: Gtk.Align.START,
    marginTop: 6,
    cssClasses: ['caption-heading', 'dim-label'],
  })

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgActionDirectionMatrix',
        Signals: {
          'animation-selected': { param_types: [GObject.TYPE_STRING] },
          'edit-animation-requested': { param_types: [GObject.TYPE_STRING] },
          'add-animation-requested': {},
          'clear-animation-requested': { param_types: [GObject.TYPE_STRING] },
        },
      },
      ActionDirectionMatrix,
    )
  }

  declare connect: GObject.SignalMethods<this, ActionDirectionMatrixSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, ActionDirectionMatrixSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, ActionDirectionMatrixSignals>['emit']

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
      label: _('Tap to preview · ⋯ to edit pictures or clear.'),
      halign: Gtk.Align.START,
      xalign: 0,
      // A longer translation must wrap, not widen the pane past a phone-width breakpoint bin.
      wrap: true,
      cssClasses: ['caption', 'dim-label'],
    })
    root.append(hint)

    this._layout.add_named(this._grid, 'grid')
    this._layout.add_named(this._lists, 'list')
    this._layout.set_visible_child_name('list')
    root.append(this._layout)

    root.append(this._customHeading)
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

    // The width the pane grants decides the layout (not a window breakpoint:
    // at desktop the pane is only part of the split). Both layouts' minimums
    // are far below the threshold, so the allocation never feeds back.
    this.add_tick_callback(() => {
      const name = gridFits(this.get_width()) ? 'grid' : 'list'
      if (this._layout.get_visible_child_name() !== name) this._layout.set_visible_child_name(name)
      return GLib.SOURCE_CONTINUE
    })
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

  /**
   * Scroll a cell's "⋯" into view and open its menu — the driveable twin of a
   * tap on it (`win.show-animation-menu`). `false` when the cell is empty or unknown.
   */
  popupCellMenu(animId: string): boolean {
    if (this._states.get(animId)?.kind !== 'filled') return false
    const find = () => this._menuButtons.get(animId)?.find((b) => b.get_mapped())
    // The page may still be sliding in (phone) or rebuilding its cells, so
    // poll for the mapped button instead of trusting a single lookup.
    let tries = 0
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      const button = find()
      if (!button) return ++tries < 30 ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE
      // Focus alone does not scroll a pane that is not laid out yet, and a
      // popover would anchor off-screen — scroll explicitly, then open a beat later.
      const adj = (button.get_ancestor(Gtk.ScrolledWindow.$gtype) as Gtk.ScrolledWindow | null)?.get_vadjustment()
      adj?.set_value(adj.get_upper() - adj.get_page_size())
      button.grab_focus()
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 700, () => {
        find()?.popup()
        return GLib.SOURCE_REMOVE
      })
      return GLib.SOURCE_REMOVE
    })
    return true
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
    // Action rows: label + one cell per direction.
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

  /**
   * A plain focusable box (not a GtkButton): the "⋯" / "+" button inside must
   * stay its own tap target, and a button parent would swallow it. A tap
   * selects (or starts filling an empty cell); Enter opens the editor.
   */
  private _buildCell(roleId: string): Gtk.Box {
    const cell = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      cssClasses: ['anim-matrix-cell'],
      focusable: true,
    })
    const click = new Gtk.GestureClick()
    click.set_button(1)
    click.connect('released', () => this._tap(roleId))
    cell.add_controller(click)
    this._addEnterKey(cell, roleId)
    return cell
  }

  private _tap(animId: string): void {
    const state = this._states.get(animId) ?? { kind: 'empty' as const }
    this.emit(cellTapIntent(state) === 'select' ? 'animation-selected' : 'edit-animation-requested', animId)
  }

  /** Enter on the focused widget itself (not on a button inside it) opens the editor. */
  private _addEnterKey(widget: Gtk.Widget, animId: string): void {
    const key = new Gtk.EventControllerKey()
    key.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    key.connect('key-pressed', (_c, keyval) => {
      if (keyval !== Gdk.KEY_Return && keyval !== Gdk.KEY_KP_Enter) return false
      if ((widget.get_root() as Gtk.Root | null)?.get_focus() !== widget) return false
      this.emit('edit-animation-requested', animId)
      return true
    })
    widget.add_controller(key)
  }

  private _animations(): CharacterAnimation[] {
    if (!this._character) return []
    return this._spriteSet?.data?.characterAnimations ?? this._character.animations ?? []
  }

  private _clear(box: Gtk.Widget): void {
    let child = box.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      ;(box as Gtk.Box).remove(child)
      child = next
    }
  }

  private _rebuild(): void {
    const anims = this._animations()
    const byId = new Map(anims.map((a) => [a.id, a]))
    this._rowsById.clear()
    this._menuButtons.clear()
    this._clear(this._lists)

    // Fill each required-role cell, and mirror it as a row of the phone layout.
    let filled = 0
    for (const [roleId, cell] of this._cellsById) {
      const anim = byId.get(roleId) ?? null
      const state = cellState(anim)
      this._states.set(roleId, state)
      if (state.kind === 'filled') filled++
      this._clear(cell)
      cell.append(this._cellContent(roleId, anim, state))
    }
    for (const action of ACTIONS) {
      this._lists.append(
        new Gtk.Label({
          label: this._actionLabel(action),
          halign: Gtk.Align.START,
          cssClasses: ['heading'],
        }),
      )
      const list = this._newList()
      for (const d of DIRECTIONS) {
        const roleId = `${action}-${d.id}`
        const anim = byId.get(roleId) ?? null
        list.append(this._buildRow(roleId, `${d.glyph} ${d.label()}`, anim, this._states.get(roleId) as CellState))
      }
      this._lists.append(list)
    }

    // Status pill — required-role coverage.
    const total = REQUIRED_ROLES.length
    this._statusPill.set_label(_('✓ %d/%d roles filled').replace('%d', String(filled)).replace('%d', String(total)))
    this._statusPill.remove_css_class('success')
    this._statusPill.remove_css_class('warning')
    this._statusPill.add_css_class(filled === total ? 'success' : 'warning')

    // Custom animations (non-role).
    this._clear(this._customBox)
    const customAnims = anims
      .filter((a) => !REQUIRED_ROLES.includes(a.id as (typeof REQUIRED_ROLES)[number]))
      .sort((a, b) => a.id.localeCompare(b.id))
    this._customHeading.set_visible(customAnims.length > 0)
    if (customAnims.length > 0) {
      const list = this._newList()
      for (const anim of customAnims) list.append(this._buildRow(anim.id, anim.id, anim, cellState(anim)))
      this._customBox.append(list)
    }

    this._applyHighlight()
  }

  private _newList(): Gtk.ListBox {
    return new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['boxed-list', 'anim-matrix-list'] })
  }

  private _thumb(anim: CharacterAnimation | null, size: number): Gtk.Picture {
    const thumb = new Gtk.Picture({
      contentFit: Gtk.ContentFit.CONTAIN,
      widthRequest: size,
      heightRequest: size,
      halign: Gtk.Align.CENTER,
      valign: Gtk.Align.CENTER,
    })
    if (anim && anim.frames.length > 0 && this._spriteSet) {
      const sprite = this._spriteSet.getSprite(anim.frames[0].spriteId)
      thumb.set_paintable(sprite?.createPaintable({ keepAspectRatio: true }) ?? null)
    }
    return thumb
  }

  private _captionFor(state: CellState, separator = ' · '): string {
    if (state.kind === 'empty') return _('Empty')
    const frames = state.frames === 1 ? _('1 frame') : _('%n frames').replace('%n', String(state.frames))
    return `${frames}${separator}${state.durationMs} ms`
  }

  /** "⋯" with Edit pictures… / Play / Clear. Its own action group keeps each button's target its own id. */
  private _menuButton(animId: string, state: CellState): Gtk.MenuButton {
    const group = new Gio.SimpleActionGroup()
    const menu = new Gio.Menu()
    for (const action of cellMenuActions(state)) {
      const act = new Gio.SimpleAction({ name: action })
      act.connect('activate', () => this._runCellAction(action, animId))
      group.add_action(act)
      menu.append(CELL_ACTION_LABELS[action](), `cell.${action}`)
    }
    const button = new Gtk.MenuButton({
      iconName: 'view-more-symbolic',
      menuModel: menu,
      tooltipText: _('Animation options'),
      cssClasses: ['flat', 'circular', 'anim-matrix-action'],
      valign: Gtk.Align.CENTER,
    })
    button.insert_action_group('cell', group)
    // Buttons sit at a cell's or row's right edge: grow the menu leftwards so a phone window never clips it.
    button.get_popover()?.set_halign(Gtk.Align.END)
    this._menuButtons.set(animId, [...(this._menuButtons.get(animId) ?? []), button])
    return button
  }

  private _addButton(animId: string): Gtk.Button {
    const button = new Gtk.Button({
      iconName: 'list-add-symbolic',
      tooltipText: _('Add pictures'),
      cssClasses: ['flat', 'circular', 'anim-matrix-action'],
      valign: Gtk.Align.CENTER,
    })
    button.connect('clicked', () => this.emit('edit-animation-requested', animId))
    return button
  }

  private _actionButton(animId: string, state: CellState): Gtk.Widget {
    return state.kind === 'empty' ? this._addButton(animId) : this._menuButton(animId, state)
  }

  private _runCellAction(action: CellAction, animId: string): void {
    if (action === 'edit') this.emit('edit-animation-requested', animId)
    else if (action === 'play') this.emit('animation-selected', animId)
    else this.emit('clear-animation-requested', animId)
  }

  private _cellContent(animId: string, anim: CharacterAnimation | null, state: CellState): Gtk.Widget {
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, marginTop: 6, marginBottom: 6 })
    box.append(this._thumb(anim, CELL_THUMB))
    box.append(
      new Gtk.Label({
        label: this._captionFor(state, '\n'),
        justify: Gtk.Justification.CENTER,
        cssClasses: ['caption', 'dim-label'],
        // Two short lines ("4 frames" / "800 ms"): the longest word, not the
        // whole caption, sets the cell's minimum width, so the five-column
        // grid stays narrow enough for a 360 px window.
      }),
    )
    // Corner button over the cell: costs no width, so the grid's floor stays low.
    const action = this._actionButton(animId, state)
    action.set_halign(Gtk.Align.END)
    action.set_valign(Gtk.Align.START)
    const overlay = new Gtk.Overlay({ child: box })
    overlay.add_overlay(action)
    return overlay
  }

  /** A row of the one-list-per-action layout (and of the custom list). */
  private _buildRow(animId: string, title: string, anim: CharacterAnimation | null, state: CellState): Adw.ActionRow {
    const row = new Adw.ActionRow({ title, subtitle: this._captionFor(state), activatable: true })
    row.add_prefix(this._thumb(anim, 40))
    row.add_suffix(this._actionButton(animId, state))
    row.connect('activated', () => this._tap(animId))
    this._addEnterKey(row, animId)
    this._rowsById.set(animId, row)
    return row
  }

  private _applyHighlight(): void {
    for (const map of [this._cellsById, this._rowsById] as Map<string, Gtk.Widget>[]) {
      for (const [id, widget] of map) {
        if (id === this._activeId) widget.add_css_class('active-cell')
        else widget.remove_css_class('active-cell')
      }
    }
  }
}

GObject.type_ensure(ActionDirectionMatrix.$gtype)
