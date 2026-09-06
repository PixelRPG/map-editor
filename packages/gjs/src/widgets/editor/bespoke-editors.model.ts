import type { ComponentSpec } from '@pixelrpg/engine'

/**
 * The `<type>.<key>` fields that render through a bespoke editor instead
 * of the generated {@link ComponentInspector} row. GTK-free so the
 * totality rule can be tested: **every basic `json` field must have an
 * entry here**, because Simple view never renders JSON raw and a basic
 * `json` field with no bespoke editor would be a field Simple view can
 * neither show nor honestly hide. `EntityComponentsEditor` maps each key
 * to its widget factory, typed against this list so the two cannot drift.
 */
export const BESPOKE_EDITOR_KEYS = ['actions.actions'] as const

export type BespokeEditorKey = (typeof BESPOKE_EDITOR_KEYS)[number]

/** Type guard for a {@link BespokeEditorKey}. */
export function isBespokeEditorKey(key: string): key is BespokeEditorKey {
  return (BESPOKE_EDITOR_KEYS as readonly string[]).includes(key)
}

/**
 * The bespoke editor a component renders through, if any — the first of
 * its fields with a registered key. A bespoke editor replaces the whole
 * generated group for that component (the `actions` list editor is the
 * component's only field), so one key per component is the shape today.
 */
export function bespokeEditorKeyFor(spec: Pick<ComponentSpec, 'type' | 'fields'>): BespokeEditorKey | null {
  for (const field of spec.fields) {
    const key = `${spec.type}.${field.key}`
    if (isBespokeEditorKey(key)) return key
  }
  return null
}
