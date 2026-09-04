import type Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterDefinition } from '@pixelrpg/engine'
import {
  AddAnimationDialog,
  confirmDestructive,
  type GdkSpriteSetResource,
  NewCharacterDialog,
  type NewCharacterDraft,
  type SpriteSetChoice,
  SpriteSetImportDialog,
  type SpriteSetImportResult,
} from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

/**
 * Dialogs the Cast view presents. Each takes only the callbacks its dialog
 * can fire; a host that hasn't bound one yet returns `undefined` from the
 * async ones, which short-circuits the follow-up instead of throwing.
 */

/** Present the sprite-set import dialog for a character appearance. */
export function presentSpriteSetImport(parent: Gtk.Widget, onImported: (result: SpriteSetImportResult) => void): void {
  const dialog = new SpriteSetImportDialog()
  dialog.kind = 'character'
  dialog.connect('spriteset-imported', (_d: SpriteSetImportDialog, result: SpriteSetImportResult) => {
    onImported(result)
  })
  dialog.present(parent)
}

/** What the new-character dialog asks of the host while it is open. */
export interface NewCharacterActions {
  listSpriteSets(): SpriteSetChoice[]
  loadPreview(spriteSetId: string): Promise<GdkSpriteSetResource | null> | undefined
  importSpriteSet(result: SpriteSetImportResult): Promise<SpriteSetChoice | null> | undefined
  createCharacter(draft: NewCharacterDraft): void
}

/**
 * Present the new-character dialog, optionally seeded with a name + kind
 * (the roster's "Add from template" slots). A sprite set imported from
 * inside the dialog is fed straight back into its picker.
 */
export function presentNewCharacterDialog(
  parent: Gtk.Widget,
  actions: NewCharacterActions,
  seed?: { name: string; kind: 'hero' | 'npc' },
): void {
  const dialog = new NewCharacterDialog()
  dialog.connect('spriteset-activated', (_d: NewCharacterDialog, id: string) => {
    void actions.loadPreview(id)?.then((resource) => dialog.setPreview(resource ?? null))
  })
  dialog.connect('import-spriteset-requested', () => {
    presentSpriteSetImport(parent, (result) => {
      void actions.importSpriteSet(result)?.then((choice) => {
        if (choice) dialog.addSpriteSet(choice)
      })
    })
  })
  dialog.connect('character-created', (_d: NewCharacterDialog, draft: NewCharacterDraft) => {
    actions.createCharacter(draft)
  })
  dialog.setSpriteSets(actions.listSpriteSets())
  if (seed) dialog.seed(seed.name, seed.kind)
  dialog.present(parent)
}

/** The character + sheet the frame editor opens against. */
export interface AnimationDialogContext {
  character: CharacterDefinition
  spriteSet: GdkSpriteSetResource | null
  existing: CharacterAnimation | null
}

/** Where a finished animation goes — the sheet-owned mutators. */
export interface AnimationActions {
  add(animation: CharacterAnimation): void
  edit(originalId: string, animation: CharacterAnimation): void
}

/**
 * Open the frame editor on an existing animation or a brand-new one. Which
 * of the two signals the dialog emits follows from `context.existing`, so
 * only the matching mutator is wired.
 */
export function presentAnimationDialog(
  parent: Gtk.Widget,
  context: AnimationDialogContext,
  actions: AnimationActions,
): void {
  const dialog = new AddAnimationDialog()
  dialog.setContext(context.character, context.spriteSet, context.existing ?? undefined)
  if (context.existing) {
    dialog.connect('animation-edited', (_d: AddAnimationDialog, originalId: string, animation: CharacterAnimation) => {
      actions.edit(originalId, animation)
    })
  } else {
    dialog.connect('animation-created', (_d: AddAnimationDialog, animation: CharacterAnimation) => {
      actions.add(animation)
    })
  }
  dialog.present(parent)
}

/** Confirm deleting a character — the roster row's destructive affordance. */
export function confirmCharacterDelete(parent: Gtk.Widget, name: string): Promise<boolean> {
  return confirmDestructive(parent, {
    heading: _('Delete character?'),
    body: _('“%s” will be removed from the project. This cannot be undone.').replace('%s', name),
  })
}
