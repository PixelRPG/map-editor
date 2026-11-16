import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { ComponentSpecRegistry, EntityDefinition } from '@pixelrpg/engine'
import { type ComponentRefOptions, EntityComponentsEditor, SignalScope } from '@pixelrpg/gjs'

import Template from './object-detail-pane.blp'

GObject.type_ensure(EntityComponentsEditor.$gtype)

/**
 * Everything the detail can ask for on behalf of the thing it shows.
 * The pane never knows WHICH thing that is — it renders what it was
 * handed and reports the gesture; the gallery half owns the list, the
 * active id and the mutation callbacks.
 */
export interface ObjectDetailActions {
  rename(name: string): void
  setCast(isCast: boolean): void
  entityChanged(entityJson: string): void
}

/** One entity definition as the detail needs to render it. */
export interface ObjectDetailContent {
  object: EntityDefinition
  /** Whether the "Character" promotion toggle applies to this entity. */
  canBeCast: boolean
  isCast: boolean
  refOptions: ComponentRefOptions
}

/**
 * The Things detail pane — the content half of the Library's
 * gallery → detail pattern (REDESIGN.md § 4.4).
 *
 * Split out of {@link ObjectsView} for the same reason as the Characters
 * pane: the Library's single `Adw.NavigationSplitView` unmaps the sidebar
 * while a collapsed split shows the content, so one `SignalScope`
 * covering both halves would tear down the detail's handlers exactly when
 * the phone drilled into it. Each half connects in its own `vfunc_map`.
 *
 * The two are joined once, at construction time, by
 * `ObjectsView.attachDetail()`; from then on the gallery pushes content
 * in and the pane reports gestures back out through
 * {@link ObjectDetailActions}.
 */
export class ObjectDetailPane extends Adw.Bin {
  declare _detail_stack: Gtk.Stack
  declare _name_row: Adw.EntryRow
  declare _cast_row: Adw.SwitchRow
  declare _editor: EntityComponentsEditor

  private _actions: ObjectDetailActions | null = null
  private _fullView = false
  private _silentName = false
  private _silentCast = false
  private signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgObjectDetailPane',
        Template,
        InternalChildren: ['detail_stack', 'name_row', 'cast_row', 'editor'],
        Properties: {
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full view',
            'Whether the detail editor renders everything (Full view) or the Simple-view subset',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      ObjectDetailPane,
    )
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._name_row, 'changed', () => {
      if (this._silentName) return
      this._actions?.rename(this._name_row.get_text())
    })
    this.signals.connect(this._cast_row, 'notify::active', () => {
      if (this._silentCast) return
      this._actions?.setCast(this._cast_row.get_active())
    })
    this.signals.connect(this._editor, 'entity-changed', (_e: EntityComponentsEditor, json: string) => {
      this._actions?.entityChanged(json)
    })
    // "Show N more settings" flips the app-wide tier (and the window
    // raises the toast with the way back).
    this.signals.connect(this._editor, 'show-more-requested', () => {
      this.activate_action('win.show-full-view', null)
    })
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  /** Join the pane to its gallery half. Called once, before any content. */
  bindActions(actions: ObjectDetailActions): void {
    this._actions = actions
  }

  /** Nothing selected — the library holds no thing to show. */
  showEmpty(): void {
    this._detail_stack.set_visible_child_name('empty')
  }

  /**
   * Render one thing, replacing whatever was shown before. Silent — the
   * rows must not report back the values they were just given.
   */
  showObject(content: ObjectDetailContent): void {
    const { object, canBeCast, isCast, refOptions } = content
    this._detail_stack.set_visible_child_name('info')
    this._silentName = true
    try {
      this._name_row.set_text(object.name)
    } finally {
      this._silentName = false
    }
    this._cast_row.set_visible(canBeCast)
    this._silentCast = true
    try {
      this._cast_row.set_active(isCast)
    } finally {
      this._silentCast = false
    }
    this._editor.setRefOptions(refOptions)
    this._editor.setEntity(object)
  }

  /** Project-scoped picker options for the inspector's `*-ref` fields. */
  setRefOptions(options: ComponentRefOptions): void {
    this._editor.setRefOptions(options)
  }

  /**
   * The components this project may edit — `effectiveComponentRegistry`,
   * so a component whose game system is switched off is not offered in
   * the Add menu. Data already on an entity is left untouched either way.
   */
  setRegistry(registry: ComponentSpecRegistry): void {
    this._editor.setRegistry(registry)
  }

  get fullView(): boolean {
    return this._fullView ?? false
  }

  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this.notify('full-view')
  }
}

GObject.type_ensure(ObjectDetailPane.$gtype)
