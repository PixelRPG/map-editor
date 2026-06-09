import { Component } from 'excalibur'

/**
 * Escape hatch for project-specific data on an object entity. The
 * engine never touches `bag`'s shape — project systems and scripts
 * read and (rarely) write it.
 *
 * Source: the `custom-data` component's `data` flows into here
 * unchanged at spawn time.
 */
export class CustomDataComponent extends Component {
  constructor(public bag: Record<string, unknown> = {}) {
    super()
  }
}
