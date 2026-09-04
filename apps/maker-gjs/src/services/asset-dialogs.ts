import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import type { SpriteSetKind } from '@pixelrpg/engine'
import { confirmDestructive, promptRename, SpriteSetImportDialog, type SpriteSetImportResult } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

/** Present the unified sprite-set import dialog for an asset of `kind`. */
export function presentAssetImport(
  parent: Gtk.Widget,
  kind: SpriteSetKind,
  onImported: (result: SpriteSetImportResult) => void,
): void {
  const dialog = new SpriteSetImportDialog()
  dialog.kind = kind
  dialog.connect('spriteset-imported', (_d: SpriteSetImportDialog, result: SpriteSetImportResult) => {
    onImported(result)
  })
  dialog.present(parent)
}

/** Ask for an asset's new display name; `onRenamed` only runs on confirm. */
export function presentRenameAsset(parent: Gtk.Widget, currentName: string, onRenamed: (name: string) => void): void {
  void promptRename(parent, { heading: _('Rename asset'), current: currentName }).then((name) => {
    if (name) onRenamed(name)
  })
}

/** An asset up for deletion, plus how many places still reference it. */
export interface DeletableAsset {
  name: string
  usedBy: number
}

/** Confirm an asset deletion; `onConfirmed` only runs when the user agrees. */
export function presentDeleteAsset(parent: Gtk.Widget, asset: DeletableAsset, onConfirmed: () => void): void {
  const body =
    asset.usedBy > 0
      ? _('“%s” is still used in %d place(s). Deleting it may break them. Continue?')
          .replace('%s', asset.name)
          .replace('%d', String(asset.usedBy))
      : _('“%s” will be removed from the project, including its files. This cannot be undone.').replace(
          '%s',
          asset.name,
        )
  void confirmDestructive(parent, { heading: _('Delete asset?'), body }).then((confirmed) => {
    if (confirmed) onConfirmed()
  })
}

/** One of the active scene's tilesets, as offered by the switcher. */
export interface TilesetChoice {
  id: string
  active: boolean
}

/**
 * Let the user re-point the Tiles-tab palette at another of the scene's
 * tilesets. Callers filter out the single-tileset case first — there is
 * nothing to choose from.
 */
export function presentTilesetSwitcher(
  parent: Gtk.Widget,
  choices: readonly TilesetChoice[],
  onPick: (spriteSetId: string) => void,
): void {
  const dialog = new Adw.AlertDialog({
    heading: _('Switch tileset'),
    body: _('Choose which of this scene’s tilesets to paint from.'),
  })
  const list = new Gtk.ListBox({ selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['boxed-list'] })
  for (const choice of choices) {
    const row = new Adw.ActionRow({
      title: choice.id,
      subtitle: choice.active ? _('Currently painting') : '',
      activatable: true,
    })
    row.connect('activated', () => {
      dialog.close()
      onPick(choice.id)
    })
    list.append(row)
  }
  dialog.set_extra_child(list)
  dialog.add_response('cancel', _('Cancel'))
  dialog.present(parent)
}
