import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { COUNTER_OPERATORS, type Condition, type ConditionLeaf, type CounterOperator } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import { comboRow, entryRow, type RowOption, spinRow, switchRow } from '../common/preference-rows.ts'
import {
  addLeaf,
  CONDITION_KINDS,
  type ConditionFlag,
  type ConditionKind,
  changeConditionKind,
  conditionKindOf,
  conditionSummary,
  defaultLeaf,
  LEAF_KINDS,
  leafForFlag,
  leafKindOf,
  leavesOf,
  removeLeaf,
  replaceLeaf,
  takesManyLeaves,
  usesItems,
} from './condition-model.ts'
import { conditionKindLabel, conditionText } from './condition-summary.ts'
import type { ComponentRefOptions } from './component-inspector.ts'
import { flagPickerRow } from './flag-picker-row.ts'

const COUNTER_RANGE = { min: -100000, max: 100000, step: 1 }

/**
 * Typed view of the signals {@link ConditionEditor} registers, layered on
 * the parent's own so inherited signals keep their argument lists.
 */
export interface ConditionEditorSignals extends Adw.PreferencesGroup.SignalSignatures {
  'condition-changed': (conditionJson: string) => void
}

/**
 * Friendly editor for one state's `when`: a "kind" row (a flag, a number,
 * an item, or `all` / `any` / `not` over leaves — one level, a group never
 * holds a group), then the rows of each leaf. The flag picker is the same
 * one the action list uses; the operator is a dropdown and the value widget
 * follows the flag's kind (switch / number / word). The group description
 * reads the whole condition back as a sentence. Every edit emits
 * `condition-changed` with the whole condition as JSON.
 */
export class ConditionEditor extends Adw.PreferencesGroup {
  private _condition: Condition
  private _refOptions: ComponentRefOptions = {}
  private _rows: Gtk.Widget[] = []
  private _silent = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgConditionEditor',
        Signals: {
          'condition-changed': { param_types: [GObject.TYPE_STRING] },
        },
      },
      ConditionEditor,
    )
  }

  declare connect: GObject.SignalMethods<this, ConditionEditorSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, ConditionEditorSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, ConditionEditorSignals>['emit']

  constructor() {
    super({ title: _('When') })
    this._condition = defaultLeaf('flag-is')
    this._rebuild()
  }

  /** Populate from a stored condition; data that is no condition starts over as a blank flag row. */
  setCondition(condition: unknown): void {
    this._condition = conditionKindOf(condition) ? (condition as Condition) : defaultLeaf('flag-is')
    this._rebuild()
  }

  setRefOptions(options: ComponentRefOptions): void {
    if (JSON.stringify(options) === JSON.stringify(this._refOptions)) return
    this._refOptions = options
    this._rebuild()
  }

  private get _flags(): ConditionFlag[] {
    return (this._refOptions.flags ?? []).map((f) => ({ value: f.value, label: f.label, kind: f.kind }))
  }

  private _flagKind(id: string): ConditionFlag['kind'] {
    return this._flags.find((f) => f.value === id)?.kind
  }

  private _set(next: Condition, rebuild: boolean): void {
    this._condition = next
    if (!this._silent) this.emit('condition-changed', JSON.stringify(next))
    if (rebuild) {
      // Not inside the signal whose row this rebuild would destroy.
      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        this._rebuild()
        return GLib.SOURCE_REMOVE
      })
    } else this._refreshSummary()
  }

  private _refreshSummary(): void {
    this.set_description(conditionSummary(this._condition, this._flags, conditionText()))
  }

  private _rebuild(): void {
    for (const row of this._rows) this.remove(row)
    this._rows = []
    this._refreshSummary()
    const kind = conditionKindOf(this._condition) ?? 'flag-is'
    this._add(this._kindRow(kind))
    const many = takesManyLeaves(kind)
    const grouped = kind === 'all' || kind === 'any' || kind === 'not'
    leavesOf(this._condition).forEach((leaf, index) => {
      for (const row of this._leafRows(leaf, index, grouped, many)) this._add(row)
    })
    if (many) this._add(this._addLeafRow())
    if (usesItems(this._condition)) this._add(this._itemsWarning())
  }

  private _add(row: Gtk.Widget): void {
    this.add(row)
    this._rows.push(row)
  }

  private _kindRow(kind: ConditionKind): Adw.ComboRow {
    const options: RowOption[] = CONDITION_KINDS.map((k) => ({ value: k, label: conditionKindLabel(k) }))
    return comboRow(_('Kind'), options, kind, (value) => {
      if (value === kind) return
      this._set(changeConditionKind(this._condition, value as ConditionKind, this._flags), true)
    })
  }

  /** The rows of one leaf; inside a group each leaf also picks its own shape and may be removed. */
  private _leafRows(leaf: ConditionLeaf, index: number, grouped: boolean, removable: boolean): Gtk.Widget[] {
    const rows: Gtk.Widget[] = []
    const kind = leafKindOf(leaf)
    const put = (next: ConditionLeaf, rebuild: boolean) => this._set(replaceLeaf(this._condition, index, next), rebuild)
    if (grouped) {
      const options: RowOption[] = LEAF_KINDS.map((k) => ({ value: k, label: conditionKindLabel(k) }))
      const row = comboRow(_('Condition'), options, kind, (value) => {
        if (value === kind) return
        const flag = 'flag' in leaf ? leaf.flag : ''
        const made = defaultLeaf(value as 'flag-is' | 'counter' | 'has-item', flag, this._flagKind(flag))
        put(made, true)
      })
      if (removable && leavesOf(this._condition).length > 1) {
        const remove = new Gtk.Button({
          iconName: 'user-trash-symbolic',
          tooltipText: _('Remove condition'),
          cssClasses: ['flat'],
          valign: Gtk.Align.CENTER,
        })
        remove.connect('clicked', () => this._set(removeLeaf(this._condition, index), true))
        row.add_suffix(remove)
      }
      rows.push(row)
    }
    if (kind === 'has-item') {
      rows.push(
        entryRow(_('Item id'), (leaf as { itemId: string }).itemId, (v) => put({ type: 'has-item', itemId: v }, false)),
      )
      return rows
    }
    const flagId = (leaf as { flag: string }).flag
    rows.push(
      flagPickerRow(this._refOptions, flagId, undefined, (id) => {
        put(leafForFlag(leaf, id, this._flagKind(id)), true)
      }),
    )
    if ('type' in leaf && leaf.type === 'counter') {
      const counter = leaf
      const ops: RowOption[] = COUNTER_OPERATORS.map((op) => ({ value: op, label: op }))
      rows.push(
        comboRow(_('Compare'), ops, counter.op, (v) => put({ ...counter, op: v as CounterOperator }, false)),
        spinRow(_('Number'), counter.value, COUNTER_RANGE, (n) => put({ ...counter, value: n }, false)),
      )
      return rows
    }
    const equals = (leaf as { equals?: boolean | string }).equals ?? true
    if (this._flagKind(flagId) === 'text' || typeof equals === 'string') {
      rows.push(
        entryRow(_('Is'), String(equals === true ? '' : equals), (v) =>
          put({ type: 'flag-is', flag: flagId, equals: v }, false),
        ),
      )
    } else {
      rows.push(
        switchRow(_('Is yes'), equals !== false, (on) => put({ type: 'flag-is', flag: flagId, equals: on }, false)),
      )
    }
    return rows
  }

  private _addLeafRow(): Adw.ButtonRow {
    const row = new Adw.ButtonRow({ title: _('Add condition'), startIconName: 'list-add-symbolic' })
    row.connect('activated', () => {
      const flag = this._flags[0]
      this._set(addLeaf(this._condition, defaultLeaf('flag-is', flag?.value ?? '', flag?.kind)), true)
    })
    return row
  }

  private _itemsWarning(): Adw.ActionRow {
    const row = new Adw.ActionRow({
      title: _('Items arrive later'),
      subtitle: _('The game has no items yet, so a condition with an item never holds.'),
      subtitleLines: 0,
    })
    row.add_prefix(new Gtk.Image({ iconName: 'dialog-warning-symbolic' }))
    return row
  }
}

GObject.type_ensure(ConditionEditor.$gtype)
