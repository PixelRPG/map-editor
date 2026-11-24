import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { FlagValue } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import { entryRow, spinRow, switchRow } from '../common/preference-rows.ts'
import { valueEditorKind } from './event-action-model.ts'
import { FLAG_NUMBER_RANGE, type MemoryRow, type MemorySections, memoryShape } from './game-memory.model.ts'
import Template from './game-memory-page.blp'

/** Puts a new value into a row that is already on screen. */
type RowUpdater = (value: FlagValue) => void

/**
 * The "Game memory" page: what the game remembers during a test run, with
 * every value editable.
 *
 * It is a view of a snapshot and nothing else. The host feeds it the
 * rows ({@link setSections}) and the values ({@link setValues}) and
 * receives the person's edits through {@link onWrite}; the page never
 * reads the engine and never writes a value itself, so a switch that did
 * not take (the run ended a frame earlier) simply stays where the next
 * snapshot puts it.
 *
 * Values arrive on every flag event, so they update the rows in place.
 * Rebuilding a row under the finger would drop a spinner mid-drag.
 */
export class GameMemoryPage extends Adw.Bin {
  declare _game_group: Adw.PreferencesGroup
  declare _things_box: Gtk.Box
  declare _empty_label: Gtk.Label
  declare _probe_row: Adw.SwitchRow

  /** Asked to set one flag; `thing` is the owning placement for a thing-scoped one. */
  onWrite: ((flag: string, value: FlagValue, thing: string | null) => void) | null = null
  /** Asked to switch the frame-time measurement. */
  onProbe: ((on: boolean) => void) | null = null

  private _shape = ''
  private _gameRows: Adw.PreferencesRow[] = []
  private _thingGroups: Adw.PreferencesGroup[] = []
  private readonly _updaters = new Map<string, RowUpdater>()
  /** True while a snapshot is being put into rows, so setting a row is not mistaken for an edit. */
  private _muted = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgGameMemoryPage',
        Template,
        InternalChildren: ['game_group', 'things_box', 'empty_label', 'probe_row'],
      },
      GameMemoryPage,
    )
  }

  constructor(params?: Partial<Adw.Bin.ConstructorProps>) {
    super(params)
    this._probe_row.connect('notify::active', () => {
      if (!this._muted) this.onProbe?.(this._probe_row.get_active())
    })
  }

  /** Forget everything: the run is over. */
  clear(): void {
    this._shape = ''
    this._clearRows()
    this._game_group.set_visible(false)
    this._empty_label.set_visible(false)
  }

  /**
   * Show these rows. A snapshot whose rows are the ones already on
   * screen only updates their values.
   */
  setSections(sections: MemorySections): void {
    const shape = memoryShape(sections)
    if (shape === this._shape) {
      this._applyRows(sections)
      return
    }
    this._shape = shape
    this._clearRows()
    this._game_group.set_visible(sections.game.length > 0)
    this._empty_label.set_visible(sections.game.length === 0 && sections.things.length === 0)
    for (const r of sections.game) this._gameRows.push(this._addRow(this._game_group, r))
    for (const thing of sections.things) {
      const group = new Adw.PreferencesGroup({
        title: thing.name,
        description: _('At tile %s, %s').replace('%s', String(thing.tileX)).replace('%s', String(thing.tileY)),
      })
      for (const r of thing.rows) this._addRow(group, r)
      this._things_box.append(group)
      this._thingGroups.push(group)
    }
  }

  /** Reflect the frame-time switch; `path` is the file it writes to while on. */
  setProbe(on: boolean, path: string | null): void {
    this._muted = true
    this._probe_row.set_active(on)
    this._muted = false
    this._probe_row.set_tooltip_text(on && path ? path : null)
  }

  /** Whether the frame-time switch is on. */
  get probeActive(): boolean {
    return this._probe_row.get_active()
  }

  private _applyRows(sections: MemorySections): void {
    this._muted = true
    try {
      for (const r of [...sections.game, ...sections.things.flatMap((t) => t.rows)])
        this._updaters.get(r.key)?.(r.value)
    } finally {
      this._muted = false
    }
  }

  private _clearRows(): void {
    for (const row of this._gameRows) this._game_group.remove(row)
    this._gameRows = []
    for (const group of this._thingGroups) this._things_box.remove(group)
    this._thingGroups = []
    this._updaters.clear()
  }

  /** One row, edited the way the flag's kind asks: a switch, a number or a word. */
  private _addRow(group: Adw.PreferencesGroup, r: MemoryRow): Adw.PreferencesRow {
    const write = (value: FlagValue) => {
      if (!this._muted) this.onWrite?.(r.flag, value, r.thing)
    }
    let row: Adw.PreferencesRow
    switch (valueEditorKind(r.kind, r.value)) {
      case 'yes-no': {
        const w = switchRow(r.name, r.value === true, write)
        this._updaters.set(r.key, (v) => w.set_active(v === true))
        row = w
        break
      }
      case 'number': {
        const w = spinRow(r.name, typeof r.value === 'number' ? r.value : 0, FLAG_NUMBER_RANGE, write)
        this._updaters.set(r.key, (v) => {
          if (typeof v === 'number' && Math.round(w.get_value()) !== v) w.set_value(v)
        })
        row = w
        break
      }
      case 'text': {
        const w = entryRow(r.name, String(r.value), write)
        this._updaters.set(r.key, (v) => {
          if (w.get_text() !== String(v)) w.set_text(String(v))
        })
        row = w
        break
      }
    }
    group.add(row)
    return row
  }
}

GObject.type_ensure(GameMemoryPage.$gtype)
