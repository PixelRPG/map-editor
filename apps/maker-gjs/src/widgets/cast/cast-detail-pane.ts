import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { CharacterDefinition, ComponentSpecRegistry, EntityDefinition } from '@pixelrpg/engine'
import {
  ActionDirectionMatrix,
  CastInspector,
  CharacterPreview,
  type ComponentRefOptions,
  EntityComponentsEditor,
  type GdkSpriteSetResource,
  SignalScope,
  type SpriteSetChoice,
} from '@pixelrpg/gjs'

import Template from './cast-detail-pane.blp'
import { characterSubtitle } from './cast-detail.ts'
import { wireAnimationMatrix, wireCastInspector, wireDetailActions } from './cast-view.wiring.ts'

GObject.type_ensure(CharacterPreview.$gtype)
GObject.type_ensure(CastInspector.$gtype)
GObject.type_ensure(ActionDirectionMatrix.$gtype)

/**
 * Everything the detail can ask for on behalf of the character it shows.
 * The pane never knows WHICH character that is — it renders what it was
 * handed and reports the gesture; the gallery half owns the roster, the
 * active id and the mutation callbacks.
 */
export interface CastDetailActions {
  rename(name: string): void
  setPlayer(isPlayer: boolean): void
  setSpeed(tilesPerSec: number): void
  changeSheet(sheetId: string): void
  editAppearance(): void
  placeOnMap(): void
  addAnimation(): void
  editAnimation(animId: string): void
  clearAnimation(animId: string): void
  entityChanged(entityJson: string): void
}

/** One character as the detail needs to render it. */
export interface CastDetailContent {
  character: CharacterDefinition
  spriteSet: GdkSpriteSetResource | null
  sheets: SpriteSetChoice[]
  /** How many characters wear the same appearance — a rename warning. */
  appearanceUsage: number
}

/**
 * The Characters detail pane — the content half of the Library's
 * gallery → detail pattern (REDESIGN.md § 4.4).
 *
 * It is a separate widget from {@link CastView} on purpose: the
 * Library's single `Adw.NavigationSplitView` unmaps the sidebar while a
 * collapsed split shows the content, so one `SignalScope` covering both
 * halves would tear down the detail's handlers exactly when the phone
 * drilled into it. Each half connects in its own `vfunc_map` instead.
 *
 * The two are joined once, at construction time, by
 * `CastView.attachDetail()`; from then on the gallery pushes content in
 * and the pane pushes gestures back out through {@link CastDetailActions}.
 */
export class CastDetailPane extends Adw.Bin {
  declare _detail_stack: Gtk.Stack
  declare _preview: CharacterPreview
  declare _detail_name: Gtk.Label
  declare _detail_player_badge: Gtk.Label
  declare _detail_subtitle: Gtk.Label
  declare _place_button: Gtk.Button
  declare _inspector: CastInspector
  declare _matrix: ActionDirectionMatrix
  declare _advanced_slot: Gtk.Box

  private _actions: CastDetailActions | null = null
  private _fullView = false
  private _advancedEditor = new EntityComponentsEditor()
  private _silentAdvanced = false
  private signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgCastDetailPane',
        Template,
        InternalChildren: [
          'detail_stack',
          'preview',
          'detail_name',
          'detail_player_badge',
          'detail_subtitle',
          'place_button',
          'inspector',
          'matrix',
          'advanced_slot',
        ],
        Properties: {
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full view',
            'Whether the detail renders everything (Full view) or the Simple-view subset',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      CastDetailPane,
    )
  }

  constructor() {
    super()
    // The generated components editor, inline — the same widget the
    // Things page uses, filtered by the view tier. It used to sit behind
    // an unremembered "All components" expander, which was a wall the
    // child re-found every session; now Simple view shows the basic
    // groups and counts the rest into "Show N more settings". Appearance
    // and speed are edited by the friendly inspector above, so their
    // components are left out here rather than shown twice.
    this._advancedEditor.setExcludedTypes(['visual', 'movement'])
    this._advancedEditor.set_margin_top(8)
    this._advanced_slot.append(this._advancedEditor)
    this._advancedEditor.fullView = this._fullView
    this._advancedEditor.connect('entity-changed', (_e: EntityComponentsEditor, json: string) => {
      if (!this._silentAdvanced) this._actions?.entityChanged(json)
    })
    this._advancedEditor.connect('show-more-requested', () => {
      this.activate_action('win.show-full-view', null)
    })
  }

  vfunc_map(): void {
    super.vfunc_map()
    this._inspector.setMode('character')

    wireCastInspector(this.signals, this._inspector, {
      rename: (name) => this._actions?.rename(name),
      setPlayer: (isPlayer) => this._actions?.setPlayer(isPlayer),
      setSpeed: (tilesPerSec) => this._actions?.setSpeed(tilesPerSec),
      changeSheet: (sheetId) => this._actions?.changeSheet(sheetId),
      editAppearance: () => this._actions?.editAppearance(),
    })
    wireAnimationMatrix(
      this.signals,
      { matrix: this._matrix, preview: this._preview },
      {
        addAnimation: () => this._actions?.addAnimation(),
        editAnimation: (animId) => this._actions?.editAnimation(animId),
        clearAnimation: (animId) => this._actions?.clearAnimation(animId),
      },
    )
    wireDetailActions(this.signals, { place: this._place_button }, { placeOnMap: () => this._actions?.placeOnMap() })
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  /** Join the pane to its gallery half. Called once, before any content. */
  bindActions(actions: CastDetailActions): void {
    this._actions = actions
  }

  /** Nothing selected — the roster is empty (§ 4.4 never shows this otherwise). */
  showEmpty(): void {
    this._detail_stack.set_visible_child_name('empty')
    this._preview.setCharacter(null, null)
  }

  /** Render one character, replacing whatever was shown before. */
  showCharacter(content: CastDetailContent): void {
    const { character, spriteSet, sheets, appearanceUsage } = content
    this._detail_stack.set_visible_child_name('info')
    this._preview.setCharacter(character, spriteSet)
    this._detail_name.set_label(character.name)
    this._detail_player_badge.set_visible(character.isPlayer === true)
    this._detail_subtitle.set_label(characterSubtitle(character))
    this._inspector.setCharacter(character)
    this._inspector.setSheets(sheets, character.spriteSetId)
    this._inspector.setAppearanceUsage(appearanceUsage)
    this._matrix.setCharacter(character, spriteSet)
  }

  /** Re-offer the appearance choices without touching the rest of the detail. */
  /** Open a matrix cell's "⋯" menu; `false` when that cell has none. */
  popupAnimationMenu(animId: string): boolean {
    return this._matrix.popupCellMenu(animId)
  }

  setSheets(sheets: SpriteSetChoice[], selectedId: string | null): void {
    this._inspector.setSheets(sheets, selectedId)
  }

  /**
   * Populate the "all components" disclosure with a raw entity def.
   * Silent — it must not report back the value it was just given.
   * `registry` is the project's EFFECTIVE component registry, so a
   * component whose game system is off is not offered here either.
   */
  setEntity(def: EntityDefinition, refOptions: ComponentRefOptions, registry?: ComponentSpecRegistry): void {
    this._silentAdvanced = true
    try {
      if (registry) this._advancedEditor.setRegistry(registry)
      this._advancedEditor.setRefOptions(refOptions)
      this._advancedEditor.setEntity(def)
    } finally {
      this._silentAdvanced = false
    }
  }

  get fullView(): boolean {
    return this._fullView ?? false
  }

  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this._advancedEditor.fullView = value
    this.notify('full-view')
  }
}

GObject.type_ensure(CastDetailPane.$gtype)
