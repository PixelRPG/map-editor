import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { ActionData, ComponentData, FlagKind, LocalizedText } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import { comboRow, entryRow, type RowOption, spinRow, switchRow } from '../common/preference-rows.ts'
import { localizedEntryRow } from './language-text-row.ts'
import { TextLanguageState } from './text-language.model.ts'
import type { ComponentRefOptions } from './component-inspector.ts'
import {
  cleanNewFlagName,
  existingFlagId,
  flagDisplayName,
  flagPickerOptions,
  isNewFlagChoice,
} from './flag-picker.model.ts'
import { actionLabel, summaryText } from './event-action-summary.ts'
import { promptNewFlag } from './new-flag-dialog.ts'
import {
  ACTION_ICONS,
  type AskAction,
  actionSummary,
  addAnswer,
  canAddAnswer,
  canRemoveAnswer,
  collectActionIds,
  defaultAction,
  editableText,
  flagValueForKind,
  makeActionId,
  moveItemTo,
  pickableActionTypes,
  removeAnswer,
  removeItem,
  setAnswerLabel,
  setCancelOption,
  valueEditorKind,
} from './event-action-model.ts'

/** Bounds shared by every numeric action field (tile coords, quantities, ms). */
const COUNT_RANGE = { min: 0, max: 100000, step: 1 }
const QUANTITY_RANGE = { min: 1, max: 100000, step: 1 }
const WAIT_RANGE = { min: 0, max: 100000, step: 50 }
const FLAG_NUMBER_RANGE = { min: -100000, max: 100000, step: 1 }

/** Teleport facing choices — a function so the labels follow the active locale. */
const FACING_OPTIONS = (): RowOption[] => [
  { value: '', label: _('(None)') },
  { value: 'up', label: _('Up') },
  { value: 'down', label: _('Down') },
  { value: 'left', label: _('Left') },
  { value: 'right', label: _('Right') },
]

/**
 * Typed view of the signals {@link EventActionListEditor} registers, layered on the
 * parent's own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface EventActionListEditorSignals extends Adw.PreferencesGroup.SignalSignatures {
  'data-changed': (dataJson: string) => void
  'remove-requested': () => void
}

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
  /** The language every text row of this editor is writing in. */
  private readonly _textLanguage = new TextLanguageState()
  private _rows: Adw.PreferencesRow[] = []
  private _addButton: Gtk.MenuButton
  private _expanded = new Set<string>()
  private _drag: { list: unknown[]; from: number } | null = null
  private _removeButton: Gtk.Button
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

  declare connect: GObject.SignalMethods<this, EventActionListEditorSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, EventActionListEditorSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, EventActionListEditorSignals>['emit']

  constructor() {
    super({ title: _('Actions') })

    this._addButton = this._buildAddButton(false, (type) => this._add(this._actions, type))
    this._removeButton = new Gtk.Button({
      iconName: 'user-trash-symbolic',
      tooltipText: _('Remove component'),
      cssClasses: ['flat'],
      valign: Gtk.Align.CENTER,
      visible: false,
    })
    this._removeButton.connect('clicked', () => this.emit('remove-requested'))

    const headerBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 })
    headerBox.append(this._addButton)
    headerBox.append(this._removeButton)
    this.set_header_suffix(headerBox)

    this._rebuild()
  }

  /** Populate from the `actions` component data (no `data-changed` echo). */
  setData(data: ComponentData): void {
    const raw = (data as { actions?: unknown }).actions
    this._actions = Array.isArray(raw) ? (JSON.parse(JSON.stringify(raw)) as ActionData[]) : []
    this._rebuild()
  }

  /** Project-scoped picker options (drives the teleport target-map combo). */
  setRefOptions(options: ComponentRefOptions): void {
    // The host re-sends the same options after every edit; a rebuild then
    // would drop the focus of the row being typed in.
    if (JSON.stringify(options) === JSON.stringify(this._refOptions)) return
    this._refOptions = options
    this._textLanguage.setLanguages(options.languages)
    this._rebuild()
  }

  /** Show / hide the header remove (🗑) button. */
  setRemovable(removable: boolean): void {
    this._removeButton.set_visible(removable)
  }

  /**
   * "Add action" menu — one entry per pickable action type. `nested` lists
   * (an answer's own) leave out `ask`: a question never sits in an answer.
   */
  private _buildAddButton(nested: boolean, onPick: (type: ActionData['type']) => void): Gtk.MenuButton {
    const menu = Gio.Menu.new()
    const group = new Gio.SimpleActionGroup()
    for (const type of pickableActionTypes(nested)) {
      const action = new Gio.SimpleAction({ name: `add-${type}` })
      action.connect('activate', () => onPick(type))
      group.add_action(action)
      menu.append(actionLabel(type), `actions.add-${type}`)
    }
    const button = new Gtk.MenuButton({
      label: _('Add action'),
      iconName: 'list-add-symbolic',
      alwaysShowArrow: true,
      cssClasses: ['flat'],
      valign: Gtk.Align.CENTER,
    })
    button.set_menu_model(menu)
    button.insert_action_group('actions', group)
    return button
  }

  private _mapLabel(id: string): string {
    if (!id) return _('(None)')
    return this._refOptions.maps?.find((m) => m.value === id)?.label ?? id
  }

  private _emitChange(): void {
    if (this._silent) return
    this.emit('data-changed', JSON.stringify({ type: 'actions', actions: this._actions } satisfies ComponentData))
  }

  /** One structural edit = one rebuild + ONE `data-changed`, so it is one undo step. */
  private _commit(): void {
    this._rebuild()
    this._emitChange()
  }

  private _add(list: ActionData[], type: ActionData['type']): void {
    const firstMapId = this._refOptions.maps?.[0]?.value ?? ''
    const id = makeActionId(type, collectActionIds(this._actions))
    list.push(defaultAction(type, id, firstMapId))
    this._expanded.add(id)
    this._commit()
  }

  /** Reorder inside `list` in place — rows hold the array by reference. */
  private _moveIn(list: unknown[], from: number, to: number): void {
    if (to < 0 || to >= list.length || from === to) return
    list.splice(0, list.length, ...moveItemTo(list, from, to))
    this._commit()
  }

  private _removeIn(list: unknown[], index: number): void {
    list.splice(0, list.length, ...removeItem(list, index))
    this._commit()
  }

  /** Merge a field patch into the action at `index` (no rebuild — keeps the row expanded). */
  private _patch(list: ActionData[], index: number, patch: Record<string, unknown>): void {
    list[index] = { ...list[index], ...patch } as ActionData
  }

  private _rebuild(): void {
    this._silent = true
    this._textLanguage.reset()
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
      for (const row of this._buildListRows(this._actions)) this._appendRow(row)
    }
    this._silent = false
  }

  private _appendRow(row: Adw.PreferencesRow): void {
    this.add(row)
    this._rows.push(row)
  }

  private _buildListRows(list: ActionData[]): Adw.ExpanderRow[] {
    return list.map((_a, i) => this._buildActionRow(list, i))
  }

  /** Remember which expanders are open across rebuilds, keyed by stable id. */
  private _trackExpanded(row: Adw.ExpanderRow, key: string): void {
    row.set_expanded(this._expanded.has(key))
    row.connect('notify::expanded', () => {
      if (this._silent) return
      if (row.get_expanded()) this._expanded.add(key)
      else this._expanded.delete(key)
    })
  }

  private _buildActionRow(list: ActionData[], index: number): Adw.ExpanderRow {
    const action = list[index]
    const row = new Adw.ExpanderRow({
      title: actionSummary(
        action,
        (id) => this._mapLabel(id),
        (id) => this._flagLabel(id),
        summaryText(),
      ),
    })
    row.add_prefix(new Gtk.Image({ iconName: ACTION_ICONS[action.type] }))
    row.add_suffix(this._buildRowMenu(list, index, _('Remove action'), true))
    this._attachReorder(row, list, index)
    this._trackExpanded(row, action.id)

    const afterEdit = () => {
      if (this._silent) return
      row.set_title(
        actionSummary(
          list[index],
          (id) => this._mapLabel(id),
          (id) => this._flagLabel(id),
          summaryText(),
        ),
      )
      this._emitChange()
    }
    for (const fieldRow of this._buildFields(action, list, index, afterEdit)) row.add_row(fieldRow)
    return row
  }

  /**
   * The "⋯" menu of an action or answer row: Move up, Move down, Remove.
   * The menu is the keyboard and phone path to reordering; dragging the
   * handle is the pointer shortcut for the same move.
   */
  private _buildRowMenu(list: unknown[], index: number, removeLabel: string, canRemove: boolean): Gtk.MenuButton {
    const group = new Gio.SimpleActionGroup()
    const entries: [string, boolean, () => void][] = [
      ['move-up', index > 0, () => this._moveIn(list, index, index - 1)],
      ['move-down', index < list.length - 1, () => this._moveIn(list, index, index + 1)],
      ['remove', canRemove, () => this._removeAt(list, index)],
    ]
    for (const [name, enabled, run] of entries) {
      const action = new Gio.SimpleAction({ name, enabled })
      action.connect('activate', run)
      group.add_action(action)
    }
    const menu = Gio.Menu.new()
    const move = Gio.Menu.new()
    move.append(_('Move up'), 'row.move-up')
    move.append(_('Move down'), 'row.move-down')
    menu.append_section(null, move)
    const remove = Gio.Menu.new()
    remove.append(removeLabel, 'row.remove')
    menu.append_section(null, remove)
    const button = new Gtk.MenuButton({
      iconName: 'view-more-symbolic',
      tooltipText: _('More actions'),
      cssClasses: ['flat'],
      valign: Gtk.Align.CENTER,
      menuModel: menu,
    })
    button.insert_action_group('row', group)
    return button
  }

  /** Remove item `index` of `list`; an answer goes through the ask so a cancel choice pointing at it is dropped. */
  private _removeAt(list: unknown[], index: number): void {
    const owner = this._askOwning(list)
    if (owner) {
      owner.list[owner.index] = removeAnswer(owner.ask, index)
      this._commit()
      return
    }
    this._removeIn(list, index)
  }

  private _askOwning(options: unknown[]): { list: ActionData[]; index: number; ask: AskAction } | null {
    const search = (list: ActionData[]): { list: ActionData[]; index: number; ask: AskAction } | null => {
      for (let i = 0; i < list.length; i++) {
        const a = list[i]
        if (a.type !== 'ask') continue
        if (a.options === options) return { list, index: i, ask: a }
        for (const o of a.options) {
          const hit = search(o.actions)
          if (hit) return hit
        }
      }
      return null
    }
    return search(this._actions)
  }

  /** A drag handle prefix plus a drop target on the row: drop moves the dragged item here, within its own list. */
  private _attachReorder(row: Adw.ExpanderRow, list: unknown[], index: number): void {
    const handle = new Gtk.Image({ iconName: 'list-drag-handle-symbolic', cssClasses: ['dim-label'] })
    const source = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE })
    source.connect('prepare', () => {
      this._drag = { list, from: index }
      const value = new GObject.Value()
      value.init(GObject.TYPE_INT)
      value.set_int(index)
      return Gdk.ContentProvider.new_for_value(value)
    })
    source.connect('drag-end', () => {
      this._drag = null
    })
    handle.add_controller(source)
    row.add_prefix(handle)

    const drop = new Gtk.DropTarget({ actions: Gdk.DragAction.MOVE })
    drop.set_gtypes([GObject.TYPE_INT])
    drop.connect('enter', () => {
      if (this._drag?.list !== list) return 0
      row.add_css_class('action-drop-active')
      return Gdk.DragAction.MOVE
    })
    drop.connect('leave', () => row.remove_css_class('action-drop-active'))
    drop.connect('drop', () => {
      row.remove_css_class('action-drop-active')
      const drag = this._drag
      if (!drag || drag.list !== list) return false
      this._drag = null
      this._moveIn(list, drag.from, index)
      return true
    })
    row.add_controller(drop)
  }

  /** Build the inline editable field rows for one action. */
  private _buildFields(
    action: ActionData,
    list: ActionData[],
    index: number,
    afterEdit: () => void,
  ): Adw.PreferencesRow[] {
    // Every field writes its patch and then re-summarises the row; the
    // per-type builders below only decide WHICH fields exist.
    const patch = (fields: Record<string, unknown>) => {
      this._patch(list, index, fields)
      afterEdit()
    }
    switch (action.type) {
      case 'show-text':
        return [
          this._textRow(
            _('Text'),
            () => (list[index] as typeof action).text,
            (v) => patch({ text: v }),
          ),
          this._textRow(
            _('Speaker (optional)'),
            () => (list[index] as typeof action).speaker,
            (v) => patch({ speaker: v === '' ? undefined : v }),
          ),
        ]
      case 'teleport':
        return [
          comboRow(_('Target map'), this._mapOptions(), action.targetMapId, (v) => patch({ targetMapId: v })),
          spinRow(_('Tile X'), action.targetTileX, COUNT_RANGE, (v) => patch({ targetTileX: v })),
          spinRow(_('Tile Y'), action.targetTileY, COUNT_RANGE, (v) => patch({ targetTileY: v })),
          comboRow(_('Facing'), FACING_OPTIONS(), action.facing ?? '', (v) => patch({ facing: v || undefined })),
        ]
      case 'give-item':
        return [
          entryRow(_('Item id'), action.itemId, (v) => patch({ itemId: v })),
          spinRow(_('Quantity'), action.qty ?? 1, QUANTITY_RANGE, (v) => patch({ qty: v })),
        ]
      case 'set-flag':
        return [this._flagRow(list, index, afterEdit), this._flagValueRow(action.flag, action.value, patch)]
      case 'play-sfx':
        return [entryRow(_('Sound'), action.sound, (v) => patch({ sound: v }))]
      case 'wait':
        return [spinRow(_('Milliseconds'), action.ms, WAIT_RANGE, (v) => patch({ ms: v }))]
      case 'ask':
        return this._buildAskRows(list, index, afterEdit)
    }
  }

  /** One authored text: the shared language-aware row (see `localizedEntryRow`). */
  private _textRow(
    title: string,
    get: () => LocalizedText | undefined,
    set: (next: LocalizedText) => void,
  ): Adw.EntryRow {
    return localizedEntryRow({ title, state: this._textLanguage, get, set }).row
  }

  private _answerName(i: number): string {
    return _('Answer %d').replace('%d', String(i + 1))
  }

  /** The Ask card body: prompt, 2–4 answers (each with its own action list), "Add an answer", cancel choice. */
  private _buildAskRows(list: ActionData[], index: number, afterEdit: () => void): Adw.PreferencesRow[] {
    const ask = (): AskAction => list[index] as AskAction
    const set = (next: AskAction) => {
      list[index] = next
    }
    const rows: Adw.PreferencesRow[] = []
    rows.push(
      this._textRow(
        _('Question'),
        () => ask().prompt,
        (v) => {
          set({ ...ask(), prompt: v })
          afterEdit()
        },
      ),
    )

    let refreshCancel: () => void = () => {}
    ask().options.forEach((option, i) => {
      const row = new Adw.ExpanderRow({ title: editableText(option.label) || this._answerName(i) })
      row.add_css_class('nested-expander')
      row.add_prefix(new Gtk.Image({ iconName: 'mail-reply-sender-symbolic' }))
      row.add_suffix(this._buildRowMenu(ask().options, i, _('Remove answer'), canRemoveAnswer(ask())))
      this._attachReorder(row, ask().options, i)
      this._trackExpanded(row, option.id)
      row.add_row(
        this._textRow(
          _('Answer text'),
          () => ask().options[i].label,
          (label) => {
            set(setAnswerLabel(ask(), i, label))
            row.set_title(editableText(label) || this._answerName(i))
            refreshCancel()
            afterEdit()
          },
        ),
      )
      for (const inner of this._buildListRows(option.actions)) {
        inner.add_css_class('nested-expander')
        row.add_row(inner)
      }
      row.add_row(this._buildAnswerAddRow(option.actions))
      rows.push(row)
    })

    const addAnswerRow = new Adw.ButtonRow({ title: _('Add an answer'), startIconName: 'list-add-symbolic' })
    addAnswerRow.set_sensitive(canAddAnswer(ask()))
    addAnswerRow.connect('activated', () => {
      const added = addAnswer(ask())
      set(added)
      this._expanded.add(added.options[added.options.length - 1].id)
      this._commit()
    })
    rows.push(addAnswerRow)

    let refreshing = false
    const choices = () => [
      { value: '', label: _('(None)') },
      ...ask().options.map((o, i) => ({ value: o.id, label: editableText(o.label) || this._answerName(i) })),
    ]
    const cancel = comboRow(_('Cancel answer'), choices(), ask().cancelOptionId ?? '', (v) => {
      if (refreshing) return
      set(setCancelOption(ask(), v || undefined))
      afterEdit()
    })
    cancel.set_subtitle(_('The answer picked when the player backs out.'))
    refreshCancel = () => {
      refreshing = true
      const all = choices()
      cancel.set_model(Gtk.StringList.new(all.map((c) => c.label)))
      cancel.set_selected(
        Math.max(
          0,
          all.findIndex((c) => c.value === (ask().cancelOptionId ?? '')),
        ),
      )
      refreshing = false
    }
    rows.push(cancel)
    return rows
  }

  /** The answer's own "Add action" row; it says, calmly, why a question is not on the menu. */
  private _buildAnswerAddRow(list: ActionData[]): Adw.ActionRow {
    const row = new Adw.ActionRow({
      title: _('Then'),
      subtitle: _('A question can’t be asked inside an answer.'),
    })
    row.add_suffix(this._buildAddButton(true, (type) => this._add(list, type)))
    return row
  }

  /**
   * The flag picker: the project's flags by name, "New…" last. Picking
   * "New…" asks for a name and kind, creates the flag through the host and
   * selects it; the stored value is always the flag's id, never its name.
   * A flag of another kind swaps the value editor and the value with it.
   */
  private _flagRow(list: ActionData[], index: number, afterEdit: () => void): Adw.ComboRow {
    const held = () => list[index] as Extract<ActionData, { type: 'set-flag' }>
    const current = held().flag
    const flags = this._refOptions.flags ?? []
    const options = flagPickerOptions(flags, current, {
      none: _('(None)'),
      create: _('New…'),
      missing: _('Missing flag'),
    })
    // Store a pick; true when the value editor has to change with it.
    const store = (id: string): boolean => {
      const kind = this._flagKind(id)
      if (!kind) {
        this._patch(list, index, { flag: id })
        return false
      }
      const before = valueEditorKind(this._flagKind(held().flag), held().value)
      this._patch(list, index, { flag: id, value: flagValueForKind(held().value, kind) })
      return kind !== before
    }
    let settled = current
    let reverting = false
    const row = comboRow(_('Flag'), options, current, (value) => {
      if (reverting) return
      if (!isNewFlagChoice(value)) {
        settled = value
        if (store(value)) {
          // Not inside the signal that this rebuild would destroy the row of.
          GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._commit()
            return GLib.SOURCE_REMOVE
          })
        } else afterEdit()
        return
      }
      // Hand the row back to what it held while the name is asked for.
      reverting = true
      row.set_selected(
        Math.max(
          0,
          options.findIndex((o) => o.value === settled),
        ),
      )
      reverting = false
      void this._createFlagFor(row, flags, (id) => {
        settled = id
        store(id)
      })
    })
    return row
  }

  /** The value of a `set-flag`, edited the way the flag's kind asks: a switch, a number or a word. */
  private _flagValueRow(
    flagId: string,
    value: boolean | number | string,
    patch: (fields: Record<string, unknown>) => void,
  ): Adw.PreferencesRow {
    switch (valueEditorKind(this._flagKind(flagId), value)) {
      case 'yes-no':
        return switchRow(_('Set to yes'), value === true, (on) => patch({ value: on }))
      case 'number':
        return spinRow(_('Value'), typeof value === 'number' ? value : 0, FLAG_NUMBER_RANGE, (n) => patch({ value: n }))
      case 'text':
        return entryRow(_('Value'), String(value), (text) => patch({ value: text }))
    }
  }

  private async _createFlagFor(
    row: Adw.ComboRow,
    flags: ReadonlyArray<{ value: string; label: string }>,
    onCreated: (flagId: string) => void,
  ): Promise<void> {
    const create = this._refOptions.createFlag
    if (!create) return
    const chosen = await promptNewFlag(row)
    if (!chosen) return
    // A name that is already a flag picks that flag: two flags of one name would read as one.
    const id =
      existingFlagId(chosen.name, flags) ??
      (cleanNewFlagName(chosen.name, flags) ? create(chosen.name, chosen.kind) : null)
    if (id) {
      onCreated(id)
      // The host re-sends the options with the new flag; this rebuild shows it selected.
      this._commit()
    }
  }

  private _flagKind(id: string): FlagKind | undefined {
    return this._refOptions.flags?.find((f) => f.value === id)?.kind
  }

  /** A flag's name; an id the project no longer has reads "Missing flag", never the raw id. */
  private _flagLabel(id: string): string {
    return flagDisplayName(this._refOptions.flags ?? [], id, _('Missing flag'))
  }

  private _mapOptions(): RowOption[] {
    return [{ value: '', label: _('(None)') }, ...(this._refOptions.maps ?? [])]
  }
}

GObject.type_ensure(EventActionListEditor.$gtype)
