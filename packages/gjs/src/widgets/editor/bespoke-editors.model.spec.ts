import { describe, expect, it } from '@gjsify/unit'
import { BUILT_IN_COMPONENT_SPECS } from '@pixelrpg/engine'
import { BESPOKE_EDITOR_KEYS, bespokeEditorKeyFor, isBespokeEditorKey } from './bespoke-editors.model.ts'

export default async () => {
  await describe('bespoke editors — the mapping is total', async () => {
    await it('gives every basic json field a bespoke editor (Simple view never renders JSON raw)', async () => {
      for (const spec of Object.values(BUILT_IN_COMPONENT_SPECS)) {
        for (const field of spec.fields) {
          if (field.input !== 'json' || field.basic !== true) continue
          expect(isBespokeEditorKey(`${spec.type}.${field.key}`)).toBe(true)
        }
      }
    })

    await it('names only real json fields of real specs', async () => {
      for (const key of BESPOKE_EDITOR_KEYS) {
        const [type, fieldKey] = key.split('.')
        const spec = BUILT_IN_COMPONENT_SPECS[type]
        expect(spec !== undefined).toBe(true)
        const field = spec?.fields.find((f) => f.key === fieldKey)
        expect(field?.input).toBe('json')
      }
    })

    await it('resolves a component to its bespoke editor, or to none', async () => {
      expect(bespokeEditorKeyFor(BUILT_IN_COMPONENT_SPECS.actions)).toBe('actions.actions')
      expect(bespokeEditorKeyFor(BUILT_IN_COMPONENT_SPECS.trigger)).toBe(null)
      // A json field that is NOT basic renders raw in Full view and is
      // hidden in Simple — no bespoke editor, by design.
      expect(bespokeEditorKeyFor(BUILT_IN_COMPONENT_SPECS['custom-data'])).toBe(null)
    })
  })
}
