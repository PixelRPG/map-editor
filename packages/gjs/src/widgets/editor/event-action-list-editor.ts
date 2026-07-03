import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { ACTION_TYPES, type ActionData, type ComponentData } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import type { ComponentRefOptions } from './component-inspector.ts'
import {
  ACTION_ICONS,
  ACTION_LABELS,
  actionSummary,
  defaultAction,
  makeActionId,
  parseFlagValue,
} from './event-action-model.ts'

/**
 * Friendly editor for an entity's ordered `actions` list (the event
 * "page" body) — a drop-in replacement for the generic
 * {@link ComponentInspector} JSON field when the component type is
 * `actions`. Each action is an `Adw.ExpanderRow` (summary title + inline
 * fields), reordered with per-row up/down buttons and removed with a
 * trash button; an "Add action" menu appends a default action of the
 * chosen type. Every mutation emits `data-changed` with the whole
 * `{ type:'actions', actions }` `ComponentData` JSON — the same contract
 * the host ({@link EntityComponentsEditor}) already applies.
 */
export class EventActionListEditor extends Adw.PreferencesGroup {
  private _actions: ActionData[] = []
  private _refOptions: ComponentRefOptions = {}
  private _rows: Adw.PreferencesRow[] = []
  private _addButton: Gtk.MenuButton
  private _removeButton: Gtk.Button
  private _headerBox: Gtk.Box
  /** Suppresses `data-changed` while (re)building rows from data. */
  private _silent = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgEventActionListEditor',
        Signals: {
          // The whole `actions` ComponentData, JSON-stringified, on any change.
          'data-changed': { param_types: [GObject.TYPE_STRING] },
          // The header remove (🗑) was clicked — remove the whole component.
          'remove-requested': {},
        },
      },
      EventActionListEditor,
    )
  }

  constructor() {
    super({ title: _('Actions') })

    const menu = Gio.Menu.new()
    const group = new Gio.SimpleActionGroup()
    for (const type of ACTION_TYPES) {
      const action = new Gio.SimpleAction({ name: `add-${type}` })
      action.connect('activate', () => this._add(type))
      group.add_action(action)
      menu.append(_(ACTION_LABELS[type]), `actions.add-${type}`)
    }
    this._addButton = new Gtk.MenuButton({
      label: _('Add action'),
      iconName: 'list-add-symbolic',
      alwaysShowArrow: true,
      cssClasses: ['flat'],
      valign: Gtk.Align.CENTER,
    })
    this._addButton.set_menu_model(menu)
    this._addButton.insert_action_group('actions', group)

    this._removeButton = new Gtk.Button({
      iconName: 'user-trash-symbolic',
      tooltipText: _('Remove component'),
      cssClasses: ['flat'],
      valign: Gtk.Align.CENTER,
      visible: false,
    })
    this._removeButton.connect('clicked', () => this.emit('remove-requested'))

    this._headerBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
    this._headerBox.append(this._addButton)
    this._headerBox.append(this._removeButton)
    this.set_header_suffix(this._headerBox)

    this._rebuild()
  }

  /** Populate from the `actions` component data (no `data-changed` echo). */
  setData(data: ComponentData): void {
    const raw = (data as { actions?: unknown }).actions
    this._actions = Array.isArray(raw) ? (raw as ActionData[]).map((a) => ({ ...a })) : []
    this._rebuild()
  }

  /** Project-scoped picker options (drives the teleport target-map combo). */
  setRefOptions(options: ComponentRefOptions): void {
    this._refOptions = options
    this._rebuild()
  }

  /** Show / hide the header remove (🗑) button. */
  setRemovable(removable: boolean): void {
    this._removeButton.set_visible(removable)
  }

  private _mapLabel(id: string): string {
    if (!id) return _('(None)')
    return this._refOptions.maps?.find((m) => m.value === id)?.label ?? id
  }

  private _emitChange(): void {
    if (this._silent) return
    this.emit('data-changed', JSON.stringify({ type: 'actions', actions: this._actions } satisfies ComponentData))
  }

  private _add(type: ActionData['type']): void {
    const firstMapId = this._refOptions.maps?.[0]?.value ?? ''
    const id = makeActionId(type, new Set(this._actions.map((a) => a.id)))
    this._actions.push(defaultAction(type, id, firstMapId))
    this._rebuild()
    this._emitChange()
  }

  private _remove(index: number): void {
    this._actions.splice(index, 1)
    this._rebuild()
    this._emitChange()
  }

  private _move(index: number, delta: number): void {
    const target = index + delta
    if (target < 0 || target >= this._actions.length) return
    const [item] = this._actions.splice(index, 1)
    this._actions.splice(target, 0, item)
    this._rebuild()
    this._emitChange()
  }

  /** Merge a field patch into action `index` (no rebuild — keeps the row expanded). */
  private _patch(index: number, patch: Record<string, unknown>): void {
    this._actions[index] = { ...this._actions[index], ...patch } as ActionData
  }

  private _rebuild(): void {
    this._silent = true
    for (const row of this._rows) this.remove(row)
    this._rows = []

    if (this._actions.length === 0) {
      const empty = new Adw.ActionRow({
        title: _('No actions yet'),
        subtitle: _('Use “Add action” to script what this event does.'),
      })
      empty.set_sensitive(false)
      this._appendRow(empty)
    } else {
      for (let i = 0; i < this._actions.length; i++) {
        this._appendRow(this._buildActionRow(this._actions[i], i))
      }
    }
    this._silent = false
  }

  private _appendRow(row: Adw.PreferencesRow): void {
    this.add(row)
    this._rows.push(row)
  }

  private _buildActionRow(action: ActionData, index: number): Adw.ExpanderRow {
    const row = new Adw.ExpanderRow({ title: actionSummary(action, (id) => this._mapLabel(id)) })
    row.add_prefix(new Gtk.Image({ iconName: ACTION_ICONS[action.type] }))

    const controls = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 0, valign: Gtk.Align.CENTER })
    const up = this._iconButton('go-up-symbolic', _('Move up'), () => this._move(index, -1))
    up.set_sensitive(index > 0)
    const down = this._iconButton('go-down-symbolic', _('Move down'), () => this._move(index, 1))
    down.set_sensitive(index < this._actions.length - 1)
    const del = this._iconButton('user-trash-symbolic', _('Remove action'), () => this._remove(index))
    controls.append(up)
    controls.append(down)
    controls.append(del)
    row.add_suffix(controls)

    const afterEdit = () => {
      if (this._silent) return
      row.set_title(actionSummary(this._actions[index], (id) => this._mapLabel(id)))
      this._emitChange()
    }
    for (const fieldRow of this._buildFields(action, index, afterEdit)) row.add_row(fieldRow)
    return row
  }

  private _iconButton(iconName: string, tooltip: string, onClick: () => void): Gtk.Button {
    const btn = new Gtk.Button({ iconName, tooltipText: tooltip, cssClasses: ['flat'], valign: Gtk.Align.CENTER })
    btn.connect('clicked', onClick)
    return btn
  }

  /** Build the inline editable field rows for one action. */
  private _buildFields(action: ActionData, index: number, afterEdit: () => void): Adw.PreferencesRow[] {
    switch (action.type) {
      case 'show-text':
        return [
          this._entry(_('Text'), action.text, (v) => {
            this._patch(index, { text: v })
            afterEdit()
          }),
          this._entry(_('Speaker (optional)'), action.speaker ?? '', (v) => {
            this._patch(index, { speaker: v || undefined })
            afterEdit()
          }),
        ]
      case 'teleport':
        return [
          this._combo(_('Target map'), this._mapOptions(), action.targetMapId, (v) => {
            this._patch(index, { targetMapId: v })
            afterEdit()
          }),
          this._spin(_('Tile X'), action.targetTileX, 0, 100000, 1, (v) => {
            this._patch(index, { targetTileX: v })
            afterEdit()
          }),
          this._spin(_('Tile Y'), action.targetTileY, 0, 100000, 1, (v) => {
            this._patch(index, { targetTileY: v })
            afterEdit()
          }),
          this._combo(_('Facing'), this._facingOptions(), action.facing ?? '', (v) => {
            this._patch(index, { facing: v || undefined })
            afterEdit()
          }),
        ]
      case 'give-item':
        return [
          this._entry(_('Item id'), action.itemId, (v) => {
            this._patch(index, { itemId: v })
            afterEdit()
          }),
          this._spin(_('Quantity'), action.qty ?? 1, 1, 100000, 1, (v) => {
            this._patch(index, { qty: v })
            afterEdit()
          }),
        ]
      case 'set-flag':
        return [
          this._entry(_('Flag'), action.flag, (v) => {
            this._patch(index, { flag: v })
            afterEdit()
          }),
          this._entry(_('Value (true/false, a number, or text)'), String(action.value), (v) => {
            this._patch(index, { value: parseFlagValue(v) })
            afterEdit()
          }),
        ]
      case 'play-sfx':
        return [
          this._entry(_('Sound'), action.sound, (v) => {
            this._patch(index, { sound: v })
            afterEdit()
          }),
        ]
      case 'wait':
        return [
          this._spin(_('Milliseconds'), action.ms, 0, 100000, 50, (v) => {
            this._patch(index, { ms: v })
            afterEdit()
          }),
        ]
    }
  }

  private _mapOptions(): ReadonlyArray<{ value: string; label: string }> {
    return [{ value: '', label: _('(None)') }, ...(this._refOptions.maps ?? [])]
  }

  private _facingOptions(): ReadonlyArray<{ value: string; label: string }> {
    return [
      { value: '', label: _('(None)') },
      { value: 'up', label: _('Up') },
      { value: 'down', label: _('Down') },
      { value: 'left', label: _('Left') },
      { value: 'right', label: _('Right') },
    ]
  }

  private _entry(title: string, value: string, onChange: (v: string) => void): Adw.EntryRow {
    const row = new Adw.EntryRow({ title })
    row.set_text(value)
    row.connect('changed', () => onChange(row.get_text()))
    return row
  }

  private _spin(
    title: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
  ): Adw.SpinRow {
    const adjustment = new Gtk.Adjustment({ lower: min, upper: max, stepIncrement: step, value })
    const row = new Adw.SpinRow({ title, adjustment, digits: 0 })
    row.connect('notify::value', () => onChange(Math.round(row.get_value())))
    return row
  }

  private _combo(
    title: string,
    options: ReadonlyArray<{ value: string; label: string }>,
    current: string,
    onChange: (v: string) => void,
  ): Adw.ComboRow {
    const values = options.map((o) => o.value)
    const model = Gtk.StringList.new(options.map((o) => o.label))
    const row = new Adw.ComboRow({ title, model })
    const initial = values.indexOf(current)
    if (initial >= 0) row.set_selected(initial)
    row.connect('notify::selected', () => {
      const i = row.get_selected()
      if (i >= 0 && i < values.length) onChange(values[i])
    })
    return row
  }
}

GObject.type_ensure(EventActionListEditor.$gtype)
