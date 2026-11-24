import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { Condition } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import type { ComponentRefOptions } from './component-inspector.ts'
import { ConditionEditor } from './condition-editor.ts'
import { type ConditionFlag, whenSentence } from './condition-model.ts'
import { conditionText } from './condition-summary.ts'

const DIALOG_WIDTH = 420
const DIALOG_HEIGHT = 520

/** Typed view of the signals {@link StateCard} registers. */
export interface StateCardSignals extends Adw.PreferencesGroup.SignalSignatures {
  'condition-changed': (conditionJson: string) => void
}

/**
 * One state of a thing as a card: the state's name, a "When …" sentence
 * that reads its condition back (the same summary source as the condition
 * editor), and — during a test run only — an "Active now" badge on the
 * state the engine resolved. Tapping the sentence opens the
 * {@link ConditionEditor} in a dialog; a state without a condition has
 * only the sentence "switched on by an action" and nothing to edit.
 */
export class StateCard extends Adw.PreferencesGroup {
  private _condition: Condition | undefined
  private _refOptions: ComponentRefOptions = {}
  private _row = new Adw.ActionRow({ titleLines: 0 })
  private _badge = new Gtk.Label({
    label: _('Active now'),
    visible: false,
    valign: Gtk.Align.CENTER,
    ellipsize: 3,
    cssClasses: ['state-active-badge'],
  })

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgStateCard',
        Signals: { 'condition-changed': { param_types: [GObject.TYPE_STRING] } },
      },
      StateCard,
    )
  }

  declare connect: GObject.SignalMethods<this, StateCardSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, StateCardSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, StateCardSignals>['emit']

  constructor(stateId: string, condition: Condition | undefined, refOptions: ComponentRefOptions) {
    super({ title: stateId })
    this._condition = condition
    this._refOptions = refOptions
    this.set_header_suffix(this._badge)
    this._row.add_css_class('state-card-row')
    if (condition !== undefined) {
      this._row.set_activatable(true)
      this._row.add_suffix(new Gtk.Image({ iconName: 'go-next-symbolic', valign: Gtk.Align.CENTER }))
      this._row.connect('activated', () => this._presentEditor())
    }
    this.add(this._row)
    this._refreshSentence()
  }

  setRefOptions(options: ComponentRefOptions): void {
    this._refOptions = options
    this._refreshSentence()
  }

  /** Show or hide the "Active now" badge; the host calls this only during a run. */
  setActive(active: boolean): void {
    this._badge.set_visible(active)
  }

  private get _flags(): ConditionFlag[] {
    return (this._refOptions.flags ?? []).map((f) => ({ value: f.value, label: f.label, kind: f.kind }))
  }

  private _refreshSentence(): void {
    this._row.set_title(whenSentence(this._condition, this._flags, conditionText()))
  }

  private _presentEditor(): void {
    const editor = new ConditionEditor()
    editor.setRefOptions(this._refOptions)
    editor.setCondition(this._condition)
    editor.connect('condition-changed', (_w: ConditionEditor, json: string) => {
      try {
        this._condition = JSON.parse(json) as Condition
      } catch {
        return
      }
      this._refreshSentence()
      this.emit('condition-changed', json)
    })
    const page = new Adw.PreferencesPage()
    page.add(editor)
    const view = new Adw.ToolbarView({ content: page })
    view.add_top_bar(new Adw.HeaderBar())
    const dialog = new Adw.Dialog({
      title: this.get_title(),
      contentWidth: DIALOG_WIDTH,
      contentHeight: DIALOG_HEIGHT,
    })
    dialog.set_child(view)
    dialog.present(this)
  }
}
