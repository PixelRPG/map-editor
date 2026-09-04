import type Gtk from '@girs/gtk-4.0'
import type { SpriteSetKind } from '@pixelrpg/engine'
import { confirmDestructive, promptRename, SpriteSetImportDialog, type SpriteSetImportResult } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

/**
 * Dialogs the Sheets view presents, with their copy. The view decides
 * WHEN to ask and what to do with the answer; the wording of the question
 * lives here.
 */

/**
 * Present the shared sprite-set import dialog for `kind` — `tileset` for
 * the "New tileset" flow, `character` for "Import appearance". Both route
 * their result through the same host import path.
 */
export function presentSpriteSetImport(
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

/** Ask for a tileset's new display name; resolves `null` when cancelled or blank. */
export function promptTilesetRename(parent: Gtk.Widget, current: string): Promise<string | null> {
  return promptRename(parent, { heading: _('Rename tileset'), current })
}

/**
 * Confirm deleting a tileset. When the set is still referenced the body
 * names the count, so the user knows what they'd break rather than reading
 * the generic "cannot be undone".
 */
export function confirmTilesetDelete(parent: Gtk.Widget, name: string, usedBy: number): Promise<boolean> {
  const body =
    usedBy > 0
      ? _(
          '“%s” is still used in %d place(s) (characters or maps). Deleting it and its image may break them. This cannot be undone.',
        )
          .replace('%s', name)
          .replace('%d', String(usedBy))
      : _('“%s” and its image will be removed from the project. This cannot be undone.').replace('%s', name)
  return confirmDestructive(parent, { heading: _('Delete tileset?'), body })
}

/**
 * Confirm deleting an appearance sheet — any character still wearing it
 * falls back to a blank preview until reassigned.
 */
export function confirmAppearanceDelete(parent: Gtk.Widget, name: string): Promise<boolean> {
  return confirmDestructive(parent, {
    heading: _('Delete appearance?'),
    body: _(
      '“%s” will be removed from the project. Characters using it lose their look until reassigned. This cannot be undone.',
    ).replace('%s', name),
  })
}
