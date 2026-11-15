import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { ComponentSpecRegistry, EntityDefinition } from '@pixelrpg/engine'
import { SignalScope } from '../../utils/signal-scope.ts'
import type { ComponentRefOptions } from './component-inspector.ts'
import { EntityComponentsEditor } from './entity-components-editor.ts'

import Template from './selected-page.blp'

/**
 * What the "Goes to" row shows for a door, already in words.
 *
 * The page cannot work this out itself: resolving a teleport's target
 * needs the project's map list, which lives at the host. So the host
 * runs `doorTargetState` from `door-target.model.ts` and translates the
 * result; `broken` only decides whether the warning icon shows, because
 * the sentence alone cannot say "this map is gone" loudly enough.
 */
export interface DoorTargetSummary {
  /** The destination as a sentence — "Tree House · (10, 12)", "Nowhere yet". */
  summary: string
  /** The target names a map the project does not have. */
  broken: boolean
}

/**
 * The placement this page edits, fed into {@link SelectedPage.setPlacement}.
 *
 * Everything here is plain data the host computed: the page neither
 * reaches into the map nor resolves a definition, so the strings stay
 * translatable at the host and the page stays testable by eye.
 */
export interface SelectedPlacementDescriptor {
  /** Placement id (unique within the map) — the id every signal carries. */
  placementId: string
  /** Library definition id, or `null` for an inline definition. */
  defId: string | null
  /**
   * What KIND of thing this is: the base definition's name for a
   * library-backed placement, a generic label for an inline one.
   */
  kind: string
  tileX: number
  tileY: number
  /** The layer's display name — not its id; the user never typed an id. */
  layerName: string
  /** The thing's sprite, or `null` when its sprite set failed to load. */
  paintable: Gdk.Paintable | null
  /**
   * The definition as it currently resolves — base **with** this
   * placement's overrides merged in. This is what the user sees and
   * edits; the host diffs the result back into overrides.
   */
  definition: EntityDefinition
  /**
   * Component types the BASE definition carries. They render but cannot
   * be removed: the override model replaces wholesale per `type` and has
   * no tombstone, so "removing" one would only let the library's value
   * show through again.
   */
  baseComponentTypes: readonly string[]
  /**
   * Where this door leads, or `null` when the placement is not a door —
   * a required field rather than a second setter, so a host that forgets
   * it fails to compile instead of showing a stale destination from
   * whatever was selected before.
   */
  doorTarget: DoorTargetSummary | null
}

/**
 * Typed view of the signals {@link SelectedPage} registers, layered on the
 * parent's own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface SelectedPageSignals extends Adw.Bin.SignalSignatures {
  'object-open-requested': (defId: string) => void
  'object-remove-requested': (placementId: string) => void
  'object-duplicate-requested': (placementId: string) => void
  'overrides-changed': (placementId: string, entityJson: string) => void
  'door-target-requested': (placementId: string) => void
}

/**
 * The editor's "Selected" page — the properties of the one placement
 * tapped on the canvas: sprite, name, kind, position, "Goes to" when the
 * thing is a door, "Edit in Library", then the generated component groups for *this placement's overrides*,
 * then Duplicate and Delete.
 *
 * With nothing selected it shows its empty state (and the host makes the
 * switcher item insensitive). Scene-wide metadata used to live here and
 * does not any more — a map's name, music and size belong to the map,
 * not to a selection, and get their own dialog (REDESIGN § 5.4).
 *
 * Edits leave as `overrides-changed::<placementId, entityJson>` carrying
 * the WHOLE edited definition; the host diffs it against the base to
 * produce the per-instance overrides. The name commits on apply (✓ or
 * Enter) rather than per keystroke: a character each would be one undo
 * entry and one collaboration op each.
 */
export class SelectedPage extends Adw.Bin {
  declare _stack: Gtk.Stack
  declare _sprite_image: Gtk.Image
  declare _name_row: Adw.EntryRow
  declare _kind_row: Adw.ActionRow
  declare _position_row: Adw.ActionRow
  declare _door_row: Adw.ActionRow
  declare _door_warning: Gtk.Image
  declare _library_row: Adw.ActionRow
  declare _components_slot: Adw.Bin
  declare _duplicate_row: Adw.ButtonRow
  declare _delete_row: Adw.ButtonRow

  private _placement: SelectedPlacementDescriptor | null = null
  /**
   * The definition as edited so far — the single source of truth for
   * what leaves this page. The name row and the components editor each
   * write only their own part of it, then the whole thing is emitted.
   */
  private _edited: EntityDefinition | null = null
  private _editor = new EntityComponentsEditor()
  private _fullView = true
  private _signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgSelectedPage',
        Template,
        InternalChildren: [
          'stack',
          'name_row',
          'sprite_image',
          'kind_row',
          'position_row',
          'door_row',
          'door_warning',
          'library_row',
          'components_slot',
          'duplicate_row',
          'delete_row',
        ],
        Properties: {
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full View',
            'Whether the advanced UI tier is on',
            GObject.ParamFlags.READWRITE,
            true,
          ),
        },
        Signals: {
          // "Edit in Library" on the selected placement (defId).
          'object-open-requested': { param_types: [GObject.TYPE_STRING] },
          // Delete (placementId).
          'object-remove-requested': { param_types: [GObject.TYPE_STRING] },
          // Duplicate (placementId).
          'object-duplicate-requested': { param_types: [GObject.TYPE_STRING] },
          // "Goes to" on a door (placementId) — the host owns the
          // picker, the pick mode and the door back.
          'door-target-requested': { param_types: [GObject.TYPE_STRING] },
          // Placement id + the whole edited definition as JSON. The id
          // guards a late emit from a placement that is no longer shown.
          'overrides-changed': { param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING] },
        },
      },
      SelectedPage,
    )
  }

  declare connect: GObject.SignalMethods<this, SelectedPageSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, SelectedPageSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, SelectedPageSignals>['emit']

  constructor() {
    super()
    this._editor.fullView = this._fullView
    this._components_slot.set_child(this._editor)
  }

  get fullView(): boolean {
    return this._fullView
  }

  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this.notify('full-view')
    this._editor.fullView = value
  }

  /** Which component types this project may edit — the project's effective registry. */
  setComponentRegistry(registry: ComponentSpecRegistry): void {
    this._editor.setRegistry(registry)
  }

  /** Project-scoped picker options for the `*-ref` component fields. */
  setRefOptions(options: ComponentRefOptions): void {
    this._editor.setRefOptions(options)
  }

  /**
   * Show one placement, or the empty state for `null`. Driven by the
   * host from the engine's `PLACEMENT_SELECTED` event and after every
   * edit that changes what a placement is.
   */
  setPlacement(desc: SelectedPlacementDescriptor | null): void {
    this._placement = desc
    // A copy: the descriptor's definition belongs to the caller's
    // resolve, and this page mutates its own as the user edits.
    this._edited = desc ? (JSON.parse(JSON.stringify(desc.definition)) as EntityDefinition) : null
    this._stack.set_visible_child_name(desc ? 'placement' : 'empty')
    if (!desc) return
    this._sprite_image.set_from_paintable(desc.paintable)
    this._sprite_image.set_visible(!!desc.paintable)
    this._name_row.set_text(desc.definition.name)
    this._kind_row.set_subtitle(desc.kind)
    this._position_row.set_subtitle(`(${desc.tileX}, ${desc.tileY}) · ${desc.layerName}`)
    this._door_row.set_visible(!!desc.doorTarget)
    this._door_row.set_subtitle(desc.doorTarget?.summary ?? '')
    this._door_warning.set_visible(desc.doorTarget?.broken === true)
    // Nothing to open for an inline definition: it has no library entry.
    this._library_row.set_visible(!!desc.defId)
    this._editor.setNonRemovableTypes(desc.baseComponentTypes)
    this._editor.setEntity(desc.definition)
  }

  vfunc_map(): void {
    super.vfunc_map()
    this._signals.connect(this._name_row, 'apply', () => this._applyName())
    this._signals.connect(this._editor, 'entity-changed', (_e: EntityComponentsEditor, json: string) =>
      this._onEntityChanged(json),
    )
    // The honesty row at the foot of the components editor: flipping the
    // app-wide tier is the window's job, not this page's.
    this._signals.connect(this._editor, 'show-more-requested', () => {
      this.activate_action('win.show-full-view', null)
    })
    this._signals.connect(this._door_row, 'activated', () => {
      if (this._placement) this.emit('door-target-requested', this._placement.placementId)
    })
    this._signals.connect(this._library_row, 'activated', () => {
      if (this._placement?.defId) this.emit('object-open-requested', this._placement.defId)
    })
    this._signals.connect(this._duplicate_row, 'activated', () => {
      if (this._placement) this.emit('object-duplicate-requested', this._placement.placementId)
    })
    this._signals.connect(this._delete_row, 'activated', () => {
      if (this._placement) this.emit('object-remove-requested', this._placement.placementId)
    })
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    super.vfunc_unmap()
  }

  /**
   * The name row committed. The editor carries the name too (it emits
   * whole definitions), so it is re-seeded rather than left to echo the
   * old one back on the next component edit.
   */
  private _applyName(): void {
    if (!this._placement || !this._edited) return
    const name = this._name_row.get_text()
    if (name === this._edited.name) return
    this._edited = { ...this._edited, name }
    this._editor.setEntity(this._edited)
    this.emit('overrides-changed', this._placement.placementId, JSON.stringify(this._edited))
  }

  /** A component was edited, added or removed — the editor hands back the whole definition. */
  private _onEntityChanged(json: string): void {
    if (!this._placement) return
    let edited: EntityDefinition
    try {
      edited = JSON.parse(json) as EntityDefinition
    } catch {
      return
    }
    this._edited = edited
    this.emit('overrides-changed', this._placement.placementId, json)
  }
}

GObject.type_ensure(SelectedPage.$gtype)
