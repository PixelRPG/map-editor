import type Gtk from '@girs/gtk-4.0'
import type { ActionDirectionMatrix, CastInspector, CharacterPreview, SignalScope } from '@pixelrpg/gjs'

import type { RoleFilter } from '../../services/cast-view-model.ts'
import { CastRosterRow } from './roster-row.ts'

/**
 * Signal wiring for the Cast view, split by the surface each group belongs
 * to. Every function takes only the widgets it connects plus the handful of
 * actions it can trigger — a helper handed the whole view would have moved
 * the code without loosening the coupling.
 *
 * All of them connect through the caller's {@link SignalScope}, so the
 * view's `vfunc_unmap` still releases everything in one `disconnectAll()`.
 */

/** The All / Heroes / NPCs chips above the roster. */
export interface RoleFilterChips {
  all: Gtk.ToggleButton
  heroes: Gtk.ToggleButton
  npcs: Gtk.ToggleButton
}

export function wireRoleFilter(
  scope: SignalScope,
  chips: RoleFilterChips,
  onFilter: (filter: RoleFilter) => void,
): void {
  const grouped: [Gtk.ToggleButton, RoleFilter][] = [
    [chips.all, 'all'],
    [chips.heroes, 'heroes'],
    [chips.npcs, 'npcs'],
  ]
  for (const [chip, filter] of grouped) {
    // A radio group toggles two chips per click; only the one switching ON
    // names the new filter.
    scope.connect(chip, 'toggled', () => {
      if (chip.get_active()) onFilter(filter)
    })
  }
}

export function wireRosterSelection(scope: SignalScope, list: Gtk.ListBox, onSelect: (charId: string) => void): void {
  scope.connect(list, 'row-selected', (_l: Gtk.ListBox, row: Gtk.ListBoxRow | null) => {
    if (!(row instanceof CastRosterRow) || !row.characterId) return
    onSelect(row.characterId)
  })
}

/** Field edits the character inspector reports for the active character. */
export interface CastInspectorActions {
  rename(name: string): void
  setPlayer(isPlayer: boolean): void
  setSpeed(tilesPerSec: number): void
  changeSheet(sheetId: string): void
  editAppearance(): void
}

export function wireCastInspector(scope: SignalScope, inspector: CastInspector, actions: CastInspectorActions): void {
  scope.connect(inspector, 'name-changed', (_i: CastInspector, name: string) => {
    actions.rename(name)
  })
  scope.connect(inspector, 'player-changed', (_i: CastInspector, isPlayer: boolean) => {
    actions.setPlayer(isPlayer)
  })
  scope.connect(inspector, 'speed-changed', (_i: CastInspector, tilesPerSec: number) => {
    actions.setSpeed(tilesPerSec)
  })
  scope.connect(inspector, 'sheet-changed', (_i: CastInspector, sheetId: string) => {
    actions.changeSheet(sheetId)
  })
  scope.connect(inspector, 'edit-appearance-requested', () => {
    actions.editAppearance()
  })
}

/** The animation matrix and the preview whose direction pad mirrors it. */
export interface AnimationMatrixWidgets {
  matrix: ActionDirectionMatrix
  preview: CharacterPreview
}

export interface AnimationMatrixActions {
  addAnimation(): void
  editAnimation(animId: string): void
  deleteAnimation(animId: string): void
}

export function wireAnimationMatrix(
  scope: SignalScope,
  widgets: AnimationMatrixWidgets,
  actions: AnimationMatrixActions,
): void {
  scope.connect(widgets.matrix, 'animation-selected', (_m: ActionDirectionMatrix, id: string) => {
    widgets.preview.setActiveAnimation(id)
  })
  // Keep the matrix highlight in sync when the preview's direction pad
  // changes the active animation.
  scope.connect(widgets.preview, 'notify::active-animation-id', () => {
    widgets.matrix.setActiveAnimation(widgets.preview.activeAnimationId || null)
  })
  scope.connect(widgets.matrix, 'add-animation-requested', () => {
    actions.addAnimation()
  })
  scope.connect(widgets.matrix, 'edit-animation-requested', (_m: ActionDirectionMatrix, id: string) => {
    actions.editAnimation(id)
  })
  scope.connect(widgets.matrix, 'delete-animation-requested', (_m: ActionDirectionMatrix, id: string) => {
    actions.deleteAnimation(id)
  })
}

/** The two call-to-action buttons above the inspector. */
export interface DetailButtons {
  editAppearance: Gtk.Button
  place: Gtk.Button
}

export interface DetailActions {
  editAppearance(): void
  placeOnMap(): void
}

export function wireDetailActions(scope: SignalScope, buttons: DetailButtons, actions: DetailActions): void {
  scope.connect(buttons.editAppearance, 'clicked', () => {
    actions.editAppearance()
  })
  scope.connect(buttons.place, 'clicked', () => {
    actions.placeOnMap()
  })
}
