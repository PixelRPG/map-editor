import { describe, expect, it } from '@gjsify/unit'
import { BUILT_IN_COMPONENT_SPECS, hiddenSettingsCount, isSimpleViewComponent } from '@pixelrpg/engine'

import { ENTITY_TEMPLATES, templatesForView } from './entity-templates.ts'

export default async () => {
  await describe('entity templates — Simple view can build every one', async () => {
    await it('seeds only Simple-view components, with nothing hidden, on every Simple-view template', async () => {
      // A template that opened with "Show N more settings" would put the
      // wall on a child's very first object — the failure mode the tier
      // design exists against.
      for (const template of templatesForView(ENTITY_TEMPLATES, false)) {
        for (const component of template.components) {
          const spec = BUILT_IN_COMPONENT_SPECS[component.type]
          expect(spec !== undefined).toBe(true)
          if (spec) expect(isSimpleViewComponent(spec)).toBe(true)
        }
        expect(hiddenSettingsCount({ components: [...template.components] }, BUILT_IN_COMPONENT_SPECS)).toBe(0)
      }
    })

    await it('offers every template in Full view and all but the Full-only ones in Simple view', async () => {
      const all = templatesForView(ENTITY_TEMPLATES, true).map((t) => t.id)
      const simple = templatesForView(ENTITY_TEMPLATES, false).map((t) => t.id)
      expect(all).toStrictEqual(ENTITY_TEMPLATES.map((t) => t.id))
      // Blank ("add components yourself") is the expert's front door.
      expect(simple.includes('custom')).toBe(false)
      expect(all.length - simple.length).toBe(1)
    })
  })
}
