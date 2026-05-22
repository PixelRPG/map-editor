import { Component } from 'excalibur'

/**
 * Escape hatch for project-specific data on an object entity. The
 * engine never touches `bag`'s shape — project systems and scripts
 * read and (rarely) write it.
 *
 * Source: `ObjectDefinition.properties.custom` flows into here
 * unchanged at spawn time.
 */
export class CustomDataComponent extends Component {
  constructor(public bag: Record<string, unknown> = {}) {
    super()
  }
}
