import { ScriptRefComponent } from '../../components/index.ts'
import type { ComponentData } from '../../types/data/index.ts'
import type { ComponentSpec } from '../component-spec.ts'

/**
 * Script — the seam for the future built-in code editor (Phase E). Builds
 * a `ScriptRefComponent` (a pure data marker; no `ScriptSystem` runs it
 * yet), so a definition can already carry user behaviour by id.
 */
interface ScriptData extends ComponentData {
  type: 'script'
  scriptId: string
  params?: Record<string, unknown>
}

export const scriptSpec: ComponentSpec = {
  type: 'script',
  system: 'core',
  editor: { label: 'Script', icon: 'text-x-script-symbolic' },
  fields: [
    // Full view only, like the component: a basic field inside a
    // non-basic component would be a row Simple view could never reach.
    { key: 'scriptId', label: 'Script id', input: 'text', required: true },
    { key: 'params', label: 'Parameters (JSON)', input: 'json' },
  ],
  build: (data) => {
    const d = data as ScriptData
    return new ScriptRefComponent(d.scriptId, d.params)
  },
}
