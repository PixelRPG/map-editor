import { Component } from 'excalibur'

/**
 * Escape hatch for project-specific data on an object entity. The
 * engine never touches `bag`'s shape — project systems and scripts
 * read and (rarely) write it.
 *
 * Source: the `custom-data` component's `data` flows into here
 * unchanged at spawn time.
 *
 * orphan-component-ok: BY DESIGN — the engine having no reader for this
 * is the point. `bag` is the project layer's escape hatch; an engine
 * system that started interpreting its shape would be the defect.
 */
export class CustomDataComponent extends Component {
  constructor(public bag: Record<string, unknown> = {}) {
    super()
  }
}
